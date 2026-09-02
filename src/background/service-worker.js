/**
 * screink service worker
 *
 * 役割：
 *   - 照準モードの起動（ショートカットキー / ポップアップからの要求）
 *   - 画面キャプチャと切り出し
 *   - QRコードのデコード
 *   - URLを新しいタブで開く（スキームの再検証つき）
 *
 * 画像処理をここで行っているのは意図的。content script 側で canvas や
 * <img src="data:..."> を扱うと、ページ側の CSP（img-src など）に縛られて
 * 会議サービスのような厳しいページで動かなくなる。service worker は拡張自身の
 * CSP 下にあるため、ページの設定に影響されない（仕様書 §4.4）。
 *
 * また、data URL の復号に fetch() を使わず atob() で行っているのは、
 * manifest.json の `connect-src 'none'` を維持するため。
 * 「送信しない」ではなく「送信できない」構造を保つ（仕様書 §8.1）。
 */

import { AIM_MODE_COMMAND } from '../shared/commands.js';
import { resolveLanguage } from '../shared/i18n.js';
// このファイルの MESSAGES は拡張内部のメッセージ種別なので、表示文字列の辞書は別名で取る
import { MESSAGES as DICTIONARIES } from '../shared/messages.js';
import { readQrPayload } from '../shared/qr-text.js';
import { getSettings } from '../shared/settings.js';
import { toSafeUrl } from '../shared/url.js';
import jsQR from '../vendor/jsqr/index.js';

const MESSAGES = {
  START_AIM_MODE: 'screink:start-aim-mode',
  GET_SETTINGS: 'screink:get-settings',
  RECOGNIZE: 'screink:recognize',
  OPEN_URL: 'screink:open-url',
  OPEN_CAPTURE_TAB: 'screink:open-capture-tab',
  GET_LAST_CAPTURE: 'screink:get-last-capture',
};

/**
 * 1つの切り出し画像から取り出すQRコードの最大数。
 * jsQR は1回の呼び出しで1つしか返さないため、見つけた領域を塗りつぶして
 * 再走査するループを回す。無制限にすると重くなるので上限を置く。
 */
const MAX_QR_CANDIDATES = 4;

/** 指した位置がQRコードの領域内かを判定するときの余裕（CSSピクセル）。 */
const HIT_MARGIN = 16;

/**
 * 切り出した画像の周囲に足す白い余白（クワイエットゾーン）の割合と下限。
 *
 * QRコードの規格は、コードの周囲に4モジュール分の余白を要求する。
 * ところが実際のスライドでは、コードが背景や画面の端にぴったり接していて
 * 余白が無いことがある。また、コードを狭く切り出すほど余白は削られる。
 *
 * 切り出した画像に白い縁を足すことで、この余白を人工的に補う。
 * 反転したコード（暗い背景に白いコード）でも、jsQR の attemptBoth が
 * 画像全体を反転するため、白い縁もまとめて黒くなり正しく働く。
 */
const QUIET_ZONE_RATIO = 0.08;
const QUIET_ZONE_MIN = 12;

/**
 * 走査にかける画像の一辺の上限（物理ピクセル）。
 * これを超える切り出しは縮小してから走査する（`detectQrCodes` を参照）。
 */
const MAX_DECODE_SIDE = 1200;

/* ------------------------------------------------------------------ *
 * 指した対象の輪郭を探すための定数（`locateTarget` を参照）
 * ------------------------------------------------------------------ */

/** 輪郭探索に使う画像の一辺の上限（物理ピクセル）。粗くてよいので小さくする。 */
const LOCATE_MAX_SIDE = 720;
/** 輪郭探索の粒度（縮小後の物理ピクセル）。 */
const LOCATE_BLOCK = 6;
/**
 * 「模様がある」と見なす明暗の混在比率。
 * QRコードは明暗がほぼ半々になる。真っ白な背景（0に近い）や
 * 真っ黒な面（1に近い）を除くためのしきい値。
 */
const LOCATE_BUSY_MIN = 0.12;
const LOCATE_BUSY_MAX = 0.88;
/** 見つけた輪郭の外側に足す余裕（ブロック数）。端のモジュールを削らないため。 */
const LOCATE_GROW_BLOCKS = 1;

/**
 * 直近の切り出し結果。PoC の目視確認用に service worker のメモリ上だけで保持し、
 * chrome.storage には書かない。service worker が停止すれば失われる（それでよい）。
 */
let lastCapture = null;

/* ------------------------------------------------------------------ *
 * 照準モードの注入
 * ------------------------------------------------------------------ */

/**
 * 照準モードのオーバーレイを対象タブへ注入する。
 *
 * 静的な content_scripts を宣言せず、ここで動的に注入している。
 * これにより host_permissions が不要になり、拡張は「使っている瞬間の
 * アクティブなタブ」以外に一切アクセスできない（仕様書 §4.2）。
 *
 * 2回目以降の注入では、注入先の isolated world に残っているコントローラが
 * 開始し直す（aim-mode.js の `start()` を参照）。照準中や結果パネルの表示中に
 * 起動しても、解除ではなく次の照準モードが始まる。解除は Esc だけとする。
 */
async function startAimMode(tabId) {
  const settings = await getSettings().catch(() => ({ uiLanguage: '' }));
  const language = resolveLanguage(settings.uiLanguage);

  await chrome.scripting.insertCSS({
    target: { tabId, allFrames: false },
    files: ['src/content/aim-mode.css'],
  });

  /*
   * オーバーレイの文言は、選ばれている言語の辞書を先に置いてから渡す。
   *
   * aim-mode.js は classic script として注入されるため import できず、
   * chrome.i18n はブラウザのUI言語で固定されていて設定に従えない。
   * 注入先は isolated world なので、ページ側からは見えない。
   */
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: (dictionary) => {
      window.__screinkMessages = dictionary;
    },
    args: [DICTIONARIES[language]],
  });

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: ['src/content/aim-mode.js'],
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/* ------------------------------------------------------------------ *
 * 画像ユーティリティ（data URL <-> Blob）
 * ------------------------------------------------------------------ */

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('invalid data URL');
  const header = dataUrl.slice(0, comma);
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/* ------------------------------------------------------------------ *
 * 切り出し
 * ------------------------------------------------------------------ */

/**
 * キャプチャ画像から指定領域を切り出す。
 *
 * 座標系（仕様書 §4.3）：
 *   - region.{x,y,width,height} は CSS ピクセル・ビューポート基準
 *   - キャプチャ画像は物理ピクセル（CSS px × devicePixelRatio）
 *   - devicePixelRatio は content script 側で毎回読み直した値を受け取る
 *     （ディスプレイ倍率とページズームの両方を含むため）
 *
 * @param {ImageBitmap} bitmap
 * @param {{width:number, height:number}} shot キャプチャ画像の物理ピクセル寸法
 * @param {{x:number, y:number, width:number, height:number}} region CSS px
 * @param {number} dpr
 */
function cropRegion(bitmap, shot, region, dpr) {
  const rawX = Math.round(region.x * dpr);
  const rawY = Math.round(region.y * dpr);
  const rawW = Math.round(region.width * dpr);
  const rawH = Math.round(region.height * dpr);

  const x = Math.min(Math.max(rawX, 0), Math.max(shot.width - 1, 0));
  const y = Math.min(Math.max(rawY, 0), Math.max(shot.height - 1, 0));
  const width = Math.max(Math.min(rawW, shot.width - x), 1);
  const height = Math.max(Math.min(rawH, shot.height - y), 1);

  // 周囲に白い余白を足す（クワイエットゾーンの補完）
  const padding = Math.max(QUIET_ZONE_MIN, Math.round(Math.min(width, height) * QUIET_ZONE_RATIO));

  const canvas = new OffscreenCanvas(width + padding * 2, height + padding * 2);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, x, y, width, height, padding, padding, width, height);

  return {
    canvas,
    device: { x, y, width, height },
    css: { x: region.x, y: region.y, width: region.width, height: region.height },
    padding,
    clamped: x !== rawX || y !== rawY || width !== rawW || height !== rawH,
  };
}

/* ------------------------------------------------------------------ *
 * 指した対象の輪郭を探す
 * ------------------------------------------------------------------ */

/**
 * 指した位置にある「模様のかたまり」の輪郭を求める。
 *
 * なぜこれが要るか：
 * 切り出しを常に「指した点を中心とする正方形」にすると、指す位置が
 * コードの中心からずれるほど、コード全体を覆うのに必要な大きさが増える
 * （半径が「中心までの距離＋コードの半分」になるため）。一方で隣のコードを
 * 巻き込まない上限は小さくなる。この2条件を同時に満たす大きさが、
 * 試す段階の刻みの間に落ちると読めない。
 *
 * 実測では、大きさの異なるコードが並んでいると、各コードの中央付近を
 * 指したときしか読めなかった（仕様書 §5.1）。
 *
 * そこで、切り出す範囲を指した点ではなく**対象そのもの**に合わせる。
 * 明暗が混在するブロックを連結し、指した位置を含むかたまりの輪郭を採る。
 * QRコードは明暗がほぼ半々なので、白い余白や単色の面と区別できる。
 *
 * @returns {{x:number,y:number,width:number,height:number} | null} CSSピクセル
 */
function locateTarget(bitmap, shot, searchRegion, dpr, point) {
  // 探索範囲を物理ピクセルへ落とし、画像内に収める
  const sx = Math.min(Math.max(Math.round(searchRegion.x * dpr), 0), Math.max(shot.width - 1, 0));
  const sy = Math.min(Math.max(Math.round(searchRegion.y * dpr), 0), Math.max(shot.height - 1, 0));
  const sw = Math.max(Math.min(Math.round(searchRegion.width * dpr), shot.width - sx), 1);
  const sh = Math.max(Math.min(Math.round(searchRegion.height * dpr), shot.height - sy), 1);

  // 粗くてよいので縮小して調べる
  const scale = Math.min(1, LOCATE_MAX_SIDE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const cols = Math.ceil(width / LOCATE_BLOCK);
  const rows = Math.ceil(height / LOCATE_BLOCK);
  const busy = new Uint8Array(cols * rows);

  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      let dark = 0;
      let total = 0;
      const yEnd = Math.min((by + 1) * LOCATE_BLOCK, height);
      const xEnd = Math.min((bx + 1) * LOCATE_BLOCK, width);
      for (let y = by * LOCATE_BLOCK; y < yEnd; y += 1) {
        for (let x = bx * LOCATE_BLOCK; x < xEnd; x += 1) {
          const i = (y * width + x) * 4;
          // 輝度の近似（緑を重く見る）
          const luma = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
          if (luma < 128) dark += 1;
          total += 1;
        }
      }
      const ratio = total > 0 ? dark / total : 0;
      busy[by * cols + bx] = ratio > LOCATE_BUSY_MIN && ratio < LOCATE_BUSY_MAX ? 1 : 0;
    }
  }

  // 指した位置をブロック座標へ
  const pointX = Math.round((point.x * dpr - sx) * scale);
  const pointY = Math.round((point.y * dpr - sy) * scale);
  const startCol = Math.min(Math.max(Math.floor(pointX / LOCATE_BLOCK), 0), cols - 1);
  const startRow = Math.min(Math.max(Math.floor(pointY / LOCATE_BLOCK), 0), rows - 1);

  // 指したブロックが「模様なし」なら、すぐ隣までは許容する
  // （コードの白い部分を指した場合に備える）
  let seedIndex = -1;
  for (let radius = 0; radius <= 2 && seedIndex < 0; radius += 1) {
    for (let dy = -radius; dy <= radius && seedIndex < 0; dy += 1) {
      for (let dx = -radius; dx <= radius && seedIndex < 0; dx += 1) {
        const col = startCol + dx;
        const row = startRow + dy;
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        if (busy[row * cols + col]) seedIndex = row * cols + col;
      }
    }
  }
  if (seedIndex < 0) return null;

  // 連結成分をたどって輪郭を求める（8近傍）
  const seen = new Uint8Array(cols * rows);
  const queue = [seedIndex];
  seen[seedIndex] = 1;
  let minCol = cols;
  let minRow = rows;
  let maxCol = -1;
  let maxRow = -1;

  while (queue.length > 0) {
    const index = queue.pop();
    const col = index % cols;
    const row = (index - col) / cols;
    if (col < minCol) minCol = col;
    if (row < minRow) minRow = row;
    if (col > maxCol) maxCol = col;
    if (row > maxRow) maxRow = row;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nextCol = col + dx;
        const nextRow = row + dy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const next = nextRow * cols + nextCol;
        if (busy[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
  }

  // ブロック座標 -> 縮小画像 -> 物理ピクセル -> CSSピクセル
  const grow = LOCATE_GROW_BLOCKS;
  const left = Math.max((minCol - grow) * LOCATE_BLOCK, 0);
  const top = Math.max((minRow - grow) * LOCATE_BLOCK, 0);
  const right = Math.min((maxCol + 1 + grow) * LOCATE_BLOCK, width);
  const bottom = Math.min((maxRow + 1 + grow) * LOCATE_BLOCK, height);

  const deviceX = sx + left / scale;
  const deviceY = sy + top / scale;
  const deviceW = (right - left) / scale;
  const deviceH = (bottom - top) / scale;

  // 探索範囲いっぱいに広がった場合は、対象を切り分けられていないので使わない
  if (deviceW > sw * 0.92 && deviceH > sh * 0.92) return null;
  // 小さすぎるものも使わない（読める下限は物理48px）
  if (deviceW < 32 || deviceH < 32) return null;

  return {
    x: deviceX / dpr,
    y: deviceY / dpr,
    width: deviceW / dpr,
    height: deviceH / dpr,
  };
}

/* ------------------------------------------------------------------ *
 * QRコードのデコード
 * ------------------------------------------------------------------ */

function bboxOfLocation(location) {
  const points = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(...xs) - x),
    height: Math.round(Math.max(...ys) - y),
  };
}

/**
 * 切り出し画像からQRコードを（複数）取り出す。
 *
 * jsQR は1回の呼び出しで最初に見つけた1つだけを返すため、
 * 見つけた領域を塗りつぶして再走査することで複数を集める。
 * 元の画像は表示に使うので、走査は複製したcanvas上で行う。
 *
 * @param {OffscreenCanvas} source
 * @returns {Array<{text: string, version: number, bbox: {x:number,y:number,width:number,height:number}}>}
 */
function detectQrCodes(source) {
  /*
   * 大きな切り出しは縮小してから走査する。
   *
   * 走査時間は画素数に比例する。一方、QRコードが読める下限は
   * 物理48px（1モジュールあたり約1.7px）と実測できている（仕様書 §5.1）。
   * 大きな範囲でしか見つからないコードは、そもそも大きく写っているので、
   * 縮小しても下限を大きく上回る。小さなコードは狭い段階で先に見つかるため、
   * 縮小の影響を受けない。
   */
  const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const work = new OffscreenCanvas(width, height);
  const ctx = work.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);

  const found = [];
  for (let attempt = 0; attempt < MAX_QR_CANDIDATES; attempt += 1) {
    const image = ctx.getImageData(0, 0, width, height);
    // attemptBoth：白地に黒／黒地に白のどちらも試す。暗い背景のスライド向け。
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!code) break;

    /*
     * 中身の文字列は jsQR の `data` をそのまま使わない。
     * Shift_JIS の日本語を取り落とすため、バイト列から復号し直す
     * （`src/shared/qr-text.js`）。
     *
     * どの符号化でも読めなかった場合も、見つけたこと自体は残す。
     * 確認画面にバイト列を出せれば、報告を受けたときに符号化を追える。
     * 候補としては提示しない（`selectCandidates` が外す）。
     */
    const payload = readQrPayload(code);

    const workBbox = bboxOfLocation(code.location);
    found.push({
      text: payload.text,
      source: payload.source,
      modes: payload.modes,
      eci: payload.eci,
      bytes: payload.bytes,
      version: code.version,
      // 縮小した座標を元の切り出し画像の座標へ戻す
      bbox: {
        x: Math.round(workBbox.x / scale),
        y: Math.round(workBbox.y / scale),
        width: Math.round(workBbox.width / scale),
        height: Math.round(workBbox.height / scale),
      },
    });

    if (workBbox.width <= 0 || workBbox.height <= 0) break;
    // 見つけた領域を潰して次を探す
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(workBbox.x - 2, workBbox.y - 2, workBbox.width + 4, workBbox.height + 4);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 候補の組み立てと選択
 * ------------------------------------------------------------------ */

/**
 * デコード結果を、ビューポート座標（CSSピクセル）つきの候補へ変換する。
 */
function toCandidate(code, crop, dpr, point) {
  // 切り出し画像内の物理ピクセル -> キャプチャ画像の物理ピクセル -> CSSピクセル
  // 切り出し画像には人工的な余白が足してあるので、その分を引く
  const cssBbox = {
    x: (code.bbox.x - crop.padding + crop.device.x) / dpr,
    y: (code.bbox.y - crop.padding + crop.device.y) / dpr,
    width: code.bbox.width / dpr,
    height: code.bbox.height / dpr,
  };

  const containsPoint =
    point.x >= cssBbox.x - HIT_MARGIN &&
    point.x <= cssBbox.x + cssBbox.width + HIT_MARGIN &&
    point.y >= cssBbox.y - HIT_MARGIN &&
    point.y <= cssBbox.y + cssBbox.height + HIT_MARGIN;

  const centerX = cssBbox.x + cssBbox.width / 2;
  const centerY = cssBbox.y + cssBbox.height / 2;
  const distance = Math.hypot(centerX - point.x, centerY - point.y);

  const url = toSafeUrl(code.text);

  /*
   * 「指した位置に対応するQRコード」と言えるかの判定（仕様書 §6）。
   *
   * 領域内にあればもちろん対象。少し外していても拾いたいので、
   * 許容する距離はQRコード自身の大きさを基準にする。画面いっぱいに
   * 表示されたQRなら大きく外しても対象、小さなQRなら近くを指したときだけ対象、
   * という挙動になる。
   *
   * これが無いと、範囲を広げる再試行のときに画面の反対側にあるQRコードを
   * 拾ってしまう（実測。DPR 2 で発生）。
   */
  const reach = Math.max(cssBbox.width, cssBbox.height);
  const near = containsPoint || distance <= reach;

  return {
    // 'undecodable'：QRコードとしては見つかったが、どの符号化でも文字にできなかったもの。
    // 確認画面には出すが、候補としては提示しない（`selectCandidates`）。
    kind: code.text === '' ? 'undecodable' : url ? 'url' : 'text',
    text: code.text,
    url,
    // 読み取りの手がかり（確認画面で出す）
    source: code.source,
    modes: code.modes,
    eci: code.eci,
    bytes: code.bytes,
    version: code.version,
    bboxCss: {
      x: Math.round(cssBbox.x),
      y: Math.round(cssBbox.y),
      width: Math.round(cssBbox.width),
      height: Math.round(cssBbox.height),
    },
    bboxInCrop: code.bbox,
    containsPoint,
    near,
    distance: Math.round(distance),
  };
}

/**
 * 指した位置に対応する候補だけを、近い順に並べて返す。
 * 遠すぎるものは捨てる。捨てたものも目視確認画面には残す。
 */
function selectCandidates(candidates) {
  return candidates
    .filter((candidate) => candidate.near && candidate.kind !== 'undecodable')
    .sort((a, b) => {
      if (a.containsPoint !== b.containsPoint) return a.containsPoint ? -1 : 1;
      return a.distance - b.distance;
    });
}

/* ------------------------------------------------------------------ *
 * 認識の本体
 * ------------------------------------------------------------------ */

/**
 * 可視領域を1枚キャプチャし、指定領域を順に試してQRコードを探す。
 *
 * regions は content script が計算した領域の配列で、前から順に試す。
 * 1つ目で見つからなければ、より広い領域へ段階的に広げる
 * （QRコードが切り出し枠より大きい場合の救済。仕様書 §4.6）。
 *
 * @param {chrome.tabs.Tab} tab
 * @param {{point: {x:number,y:number}, dpr: number,
 *          regions: Array<{x:number,y:number,width:number,height:number}>}} request
 */
async function recognize(tab, request) {
  const startedAt = performance.now();

  const shotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bitmap = await createImageBitmap(dataUrlToBlob(shotDataUrl));
  // close() したあとは width / height が 0 になるので先に取っておく
  const shot = { width: bitmap.width, height: bitmap.height };

  const dpr = Number.isFinite(request.dpr) && request.dpr > 0 ? request.dpr : 1;
  const point = {
    x: Number(request.point?.x) || 0,
    y: Number(request.point?.y) || 0,
  };
  const ladder = Array.isArray(request.regions) && request.regions.length > 0
    ? request.regions
    : [];

  /*
   * まず、指した位置にある「模様のかたまり」の輪郭を探し、そこを最初に試す。
   * 対象そのものに合わせて切り出すので、隣に別のコードがあっても、
   * 大きさが違っても、指す位置が中心からずれていても切り分けられる。
   *
   * 見つからない場合や読めなかった場合は、従来どおり
   * 「指した点を中心に狭い方から広げる」段階へ落ちる。
   */
  let located = null;
  if (ladder.length > 0) {
    try {
      located = locateTarget(bitmap, shot, ladder[ladder.length - 1], dpr, point);
    } catch (error) {
      console.warn('[screink] 輪郭の探索に失敗しました:', error);
    }
  }

  const regions = located ? [located, ...ladder] : ladder;

  /** 目視確認用に残す切り出し（見つからなくても最初の1枚は残す）。 */
  let used = null;
  /** 指した位置に対応する候補が得られた切り出し。 */
  let matched = null;
  let attemptCount = 0;

  try {
    for (const region of regions) {
      attemptCount += 1;
      const crop = cropRegion(bitmap, shot, region, dpr);
      const candidates = detectQrCodes(crop.canvas).map((code) =>
        toCandidate(code, crop, dpr, point),
      );
      if (used === null || candidates.length > 0) used = { crop, candidates };

      const selected = selectCandidates(candidates);
      if (selected.length > 0) {
        matched = { crop, candidates, selected };
        break;
      }
    }
  } finally {
    bitmap.close();
  }

  if (used === null) throw new Error('切り出す領域が指定されていません');

  const result = matched ?? { ...used, selected: [] };
  const elapsedMs = Math.round(performance.now() - startedAt);

  lastCapture = {
    dataUrl: await canvasToDataUrl(result.crop.canvas),
    device: result.crop.device,
    css: result.crop.css,
    // 画像には人工的な白い余白が付いている。位置を重ねる側はこの分をずらす
    padding: result.crop.padding,
    locatedTarget: located !== null,
    viewportImage: shot,
    dpr,
    clamped: result.crop.clamped,
    point,
    // 目視確認画面には、採用しなかったものも含めてすべて出す
    candidates: result.candidates,
    selectedCount: result.selected.length,
    attemptCount,
    elapsedMs,
    engine: 'jsqr',
  };

  return {
    geometry: {
      device: result.crop.device,
      css: result.crop.css,
      viewportImage: shot,
      dpr,
      clamped: result.crop.clamped,
    },
    // 画像本体は content script へ渡さない（ページ側 CSP に縛られるため）。
    // 表示は拡張ページ側（src/debug/）で行う。
    // 指した位置に対応するものだけを、近い順に渡す。
    candidates: result.selected,
    /*
     * QRコードとしては見つかったが、どの符号化でも文字にできなかったものがあるか。
     * 「見つからなかった」と「読めなかった」は原因も次の一手も違うので、
     * パネルの文言を分けるために渡す。
     */
    undecodable: result.candidates.some((candidate) => candidate.kind === 'undecodable'),
    chosenIndex: result.selected.length > 0 ? 0 : -1,
    attemptCount,
    elapsedMs,
    engine: 'jsqr',
  };
}

/**
 * 候補のうち最初のURLを新しいタブで開く（ダイレクトリンク用）。
 *
 * 候補は近い順に並んでいるので、先頭が「指した位置にいちばん近いURL」になる。
 * 開けたらその URL、開かなかった・開けなかったら null を返す。
 *
 * @param {Array<{kind: string, url: string | null}>} candidates
 */
async function openFirstUrl(candidates) {
  const candidate = candidates.find((entry) => entry.kind === 'url');
  const url = candidate ? toSafeUrl(candidate.url) : null;
  if (!url) return null;

  try {
    await chrome.tabs.create({ url });
    return url;
  } catch (error) {
    // 開けなかったときは黙って確認パネルへ落とす（呼び出し側が null を見る）
    console.warn('[screink] ダイレクトリンクを開けませんでした:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * イベント
 * ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== AIM_MODE_COMMAND) return;
  const target = tab ?? (await getActiveTab());
  if (!target?.id) return;
  try {
    await startAimMode(target.id);
  } catch (error) {
    console.warn('[screink] 照準モードを開始できませんでした:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;

  if (type === MESSAGES.GET_SETTINGS) {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }

  if (type === MESSAGES.START_AIM_MODE) {
    (async () => {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, reason: 'no-active-tab' });
        return;
      }
      try {
        await startAimMode(tab.id);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, reason: 'injection-failed', detail: String(error) });
      }
    })();
    return true;
  }

  if (type === MESSAGES.RECOGNIZE) {
    (async () => {
      const tab = sender.tab ?? (await getActiveTab());
      if (!tab?.id) {
        sendResponse({ ok: false, reason: 'no-active-tab' });
        return;
      }
      try {
        const result = await recognize(tab, message);
        const settings = await getSettings();
        if (settings.openCaptureInTab) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('src/debug/capture.html') });
        }
        /*
         * ダイレクトリンクが on なら、確認パネルを経ずにここで開く。
         *
         * 開く直前に `toSafeUrl()` を通すのは、確認を挟む経路と同じ。
         * 確認UIを省いても、http / https 以外を開かないという保証は変わらない
         * （仕様書 §5.2・§5.4）。
         *
         * URLでない候補（テキストのQRコード）や、見つからなかった場合は開かない。
         * その場合は今までどおりパネルを出す。
         */
        const opened = settings.directLink ? await openFirstUrl(result.candidates) : null;
        sendResponse({
          ok: true,
          ...result,
          opened,
          openedInTab: settings.openCaptureInTab,
        });
      } catch (error) {
        sendResponse({ ok: false, reason: 'capture-failed', detail: String(error) });
      }
    })();
    return true;
  }

  if (type === MESSAGES.OPEN_URL) {
    (async () => {
      // content script から受け取った文字列を信用しない。開く直前に必ず再検証する。
      const url = toSafeUrl(message.url);
      if (!url) {
        sendResponse({ ok: false, reason: 'unsafe-url' });
        return;
      }
      try {
        await chrome.tabs.create({ url });
        sendResponse({ ok: true, url });
      } catch (error) {
        sendResponse({ ok: false, reason: 'open-failed', detail: String(error) });
      }
    })();
    return true;
  }

  if (type === MESSAGES.OPEN_CAPTURE_TAB) {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('src/debug/capture.html') })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, detail: String(error) }));
    return true;
  }

  if (type === MESSAGES.GET_LAST_CAPTURE) {
    sendResponse({ ok: true, capture: lastCapture });
    return false;
  }

  return false;
});
