/**
 * screink service worker
 *
 * 役割：
 *   - 照準モードの起動（ショートカットキー / ポップアップからの要求）
 *   - 画面キャプチャと切り出し
 *   - QRコードのデコード
 *   - QRで見つからなければ OCR（offscreen document 経由）
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
import { findUrlsInWords, groupWordsIntoLines, planLineJoins } from '../shared/url-text.js';
import jsQR from '../vendor/jsqr/index.js';

const MESSAGES = {
  START_AIM_MODE: 'screink:start-aim-mode',
  OCR: 'screink:ocr',
  OCR_RUN: 'screink:ocr-run',
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
 * OCR の前処理の定数（`preprocessForOcr` を参照）
 * ------------------------------------------------------------------ */

/**
 * OCR にかける画像を、CSSピクセルの何倍まで拡大するか。
 *
 * 小さい文字の精度に効くのは**物理ピクセルでの文字の大きさ**なので、
 * 倍率は devicePixelRatio で割って決める。高DPI環境ではキャプチャの時点で
 * すでに拡大されているため、そこへさらに3倍かけても精度は伸びず時間だけ増える
 * （仕様書 §4.6）。
 */
const OCR_TARGET_SCALE = 2.5;
const OCR_MIN_SCALE = 1;
const OCR_MAX_SCALE = 3;
/**
 * OCR にかける画像の画素数の上限。これを超えないよう倍率を抑える。
 * 認識にかかる時間はおおむね画素数に比例するので、一辺ではなく面積で抑える
 * （帯は横に長いため、一辺で抑えると横に伸びたときだけ極端に解像度が落ちる）。
 */
const OCR_MAX_PIXELS = 1_600_000;
/** コントラストを伸ばすときに、両端で切り落とす画素の割合。 */
const OCR_CLIP_RATIO = 0.02;
/** 明暗の幅がこれ未満なら伸ばさない（単色に近い面をノイズだけ強調しないため）。 */
const OCR_MIN_RANGE = 24;

/* ------------------------------------------------------------------ *
 * 指した行の広がりを調べるための定数（`locateTextRun` を参照）
 * ------------------------------------------------------------------ */

/** 行を追うときの縮小後の幅の上限（物理ピクセル）。粗くてよい。 */
const TEXT_MAX_WIDTH = 1400;
/** 背景の明るさとの差がこれを超える画素を「文字がある」と見なす。 */
const TEXT_INK_DELTA = 48;
/** 行の縦の範囲を測るとき、指した位置の左右この範囲だけを見る（縮小後の画素）。 */
const TEXT_LOCAL_WINDOW = 120;
/** 行の縦を追うときに許す空白（縮小後の画素）。文字の間の隙間で切らないため。 */
const TEXT_ROW_GAP = 2;
/** 横に追うときに許す空白を、行の高さの何倍までとするか。 */
const TEXT_GAP_RATIO = 1.2;
/** 追った結果の左右に足す余白を、行の高さの何倍にするか。 */
const TEXT_MARGIN_RATIO = 0.5;
/** これより狭い結果は使わない（CSSピクセル）。 */
const TEXT_MIN_WIDTH = 48;

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
 * OCR の前処理
 * ------------------------------------------------------------------ */

/**
 * OCR にかける前に、拡大・グレースケール・コントラスト強調をかける。
 *
 * 小さい文字の精度に大きく効くため、Phase 1 の時点から入れている。
 * 素の画像で精度を測ると「OCRでは無理」と誤った判断をしかねない（仕様書 §4.6）。
 *
 * コントラストは固定の係数ではなく、実際の明暗の分布に合わせて伸ばす。
 * 会議の画面共有は、白地に黒とも暗地に白とも限らず、圧縮で灰色に寄ることも多い。
 * 両端の 2% を切り落としてから 0〜255 へ伸ばすので、薄い文字ほど効く。
 *
 * @param {OffscreenCanvas} source 切り出した画像（物理ピクセル）
 * @param {number} dpr
 * @returns {{canvas: OffscreenCanvas, scale: number}} scale は source に対する倍率
 */
function preprocessForOcr(source, dpr) {
  // 上限は3倍と画素数。どちらに当たっても、縮小はしない（下限は等倍）
  const scale = Math.max(
    OCR_MIN_SCALE,
    Math.min(
      OCR_TARGET_SCALE / dpr,
      OCR_MAX_SCALE,
      Math.sqrt(OCR_MAX_PIXELS / (source.width * source.height)),
    ),
  );

  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;

  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    // 輝度の近似（緑を重く見る）。`locateTarget` と同じ式
    const luma = Math.round((data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10);
    data[i] = luma;
    histogram[luma] += 1;
  }

  const clip = Math.round(width * height * OCR_CLIP_RATIO);
  let low = 0;
  let high = 255;
  for (let value = 0, sum = 0; value < 256; value += 1) {
    sum += histogram[value];
    if (sum > clip) {
      low = value;
      break;
    }
  }
  for (let value = 255, sum = 0; value >= 0; value -= 1) {
    sum += histogram[value];
    if (sum > clip) {
      high = value;
      break;
    }
  }

  const gain = high - low >= OCR_MIN_RANGE ? 255 / (high - low) : 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i];
    const value = gain > 0 ? Math.min(255, Math.max(0, Math.round((luma - low) * gain))) : luma;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);

  return { canvas, scale };
}

/* ------------------------------------------------------------------ *
 * 行の見た目（色・下線）を測る
 * ------------------------------------------------------------------ */

/** 下線を探すために、行の矩形を下へどれだけ伸ばすか（行の高さの割合）。 */
const STYLE_UNDERLINE_REACH = 0.35;
/** 横に連なる文字がこの割合を超えたら、下線が引かれていると見なす。 */
const STYLE_UNDERLINE_RATIO = 0.6;

/**
 * 行ごとの見た目を測る（仕様書 §5.5）。
 *
 * 折り返されたURLを続きと見なしてよいかは、**表示している側がその2行を
 * 同じものとして扱っているか**で決める。色が変わっていたり、下線が片方だけ
 * だったりするなら、それは別のものである。
 *
 * @param {OffscreenCanvas} canvas 切り出し画像（前処理前・色が残っているもの）
 * @param {Array<{index:number, x0:number, y0:number, x1:number, y1:number}>} lines
 *        OCR にかけた画像の座標系
 * @param {number} scale 切り出し画像 -> OCR画像 の倍率
 * @returns {Array<{color: number[]|null, underline: boolean|null}>} 行番号で引ける
 */
function measureLineStyles(canvas, lines, scale) {
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const styles = [];

  for (const line of lines) {
    const x = Math.max(Math.floor(line.x0 / scale), 0);
    const y = Math.max(Math.floor(line.y0 / scale), 0);
    const height = Math.max(Math.round((line.y1 - line.y0) / scale), 1);
    const width = Math.min(
      Math.max(Math.round((line.x1 - line.x0) / scale), 1),
      canvas.width - x,
    );
    // 下線は文字の下にあるので、少し下まで見る
    const reach = Math.min(
      height + Math.round(height * STYLE_UNDERLINE_REACH),
      canvas.height - y,
    );
    if (width < 1 || reach < 1) {
      styles[line.index] = { color: null, underline: null };
      continue;
    }

    const { data } = ctx.getImageData(x, y, width, reach);
    const luma = new Uint8Array(width * reach);
    const histogram = new Uint32Array(32);
    for (let i = 0, p = 0; p < luma.length; i += 4, p += 1) {
      const value = Math.round((data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10);
      luma[p] = value;
      histogram[value >> 3] += 1;
    }
    let bucket = 0;
    for (let index = 1; index < histogram.length; index += 1) {
      if (histogram[index] > histogram[bucket]) bucket = index;
    }
    const background = bucket * 8 + 4;

    // 文字の色は、背景から離れた画素の平均
    let count = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let p = 0; p < luma.length; p += 1) {
      if (Math.abs(luma[p] - background) <= TEXT_INK_DELTA) continue;
      count += 1;
      red += data[p * 4];
      green += data[p * 4 + 1];
      blue += data[p * 4 + 2];
    }
    const color =
      count > 0
        ? [Math.round(red / count), Math.round(green / count), Math.round(blue / count)]
        : null;

    /*
     * 下線は、文字の下の方に現れる「横に長く連なった画素」。
     * 文字そのものと混ざらないよう、行の下半分から下だけを見る。
     */
    let underline = false;
    for (let row = Math.round(height * 0.7); row < reach; row += 1) {
      let run = 0;
      let longest = 0;
      for (let column = 0; column < width; column += 1) {
        if (Math.abs(luma[row * width + column] - background) > TEXT_INK_DELTA) {
          run += 1;
          if (run > longest) longest = run;
        } else {
          run = 0;
        }
      }
      if (longest >= width * STYLE_UNDERLINE_RATIO) {
        underline = true;
        break;
      }
    }

    styles[line.index] = { color, underline };
  }

  return styles;
}

/* ------------------------------------------------------------------ *
 * 指した行が横にどこまで続いているかを調べる
 * ------------------------------------------------------------------ */

/**
 * 指した位置にある文字の並びが、横にどこまで続いているかを求める。
 *
 * なぜこれが要るか：
 * OCR用の帯の幅を固定にすると、**長いURLが帯の端で切れる。** 実機で
 * `...&chancnt=0&lan=1` の `chancnt` の途中までしか読めなかった（仕様書 §17）。
 * 切れた場所の字は欠けた形になるため、別の字として読まれもする。
 *
 * QRコードで「指した対象の輪郭に合わせて切り出す」（`locateTarget`）のと
 * 同じ考え方を、横に長い対象へ当てたもの。**横に何かが連なる限り切らない。**
 *
 * 手順：
 *   1. 帯の高さ分だけを見て、指した位置の近くで「文字がある行」を探す
 *   2. その行の上下の広がりを求める（＝行の高さ）
 *   3. 行の範囲だけで縦に潰した明暗から、指した列を起点に左右へ広げる。
 *      行の高さの 1.2 倍を超える空白に当たったら、そこで途切れたと見なす
 *
 * 縦は動かさない。帯の高さは設定のまま、指した位置を中心にする
 * （行の検出を外したときに、読める範囲が狭くならないようにするため）。
 *
 * @param {ImageBitmap} bitmap キャプチャ画像
 * @param {{width:number, height:number}} shot キャプチャ画像の物理ピクセル寸法
 * @param {{x:number, y:number}} point 指した位置（CSSピクセル）
 * @param {number} dpr
 * @param {number} heightCss 帯の高さ（CSSピクセル）
 * @returns {{x:number, width:number} | null} CSSピクセル。求まらなければ null
 */
function locateTextRun(bitmap, shot, point, dpr, heightCss) {
  const bandHeight = Math.max(Math.round(heightCss * dpr), 1);
  const sy = Math.min(
    Math.max(Math.round(point.y * dpr - bandHeight / 2), 0),
    Math.max(shot.height - 1, 0),
  );
  const sh = Math.max(Math.min(bandHeight, shot.height - sy), 1);

  const scale = Math.min(1, TEXT_MAX_WIDTH / shot.width);
  const width = Math.max(1, Math.round(shot.width * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(bitmap, 0, sy, shot.width, sh, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  /*
   * 背景の明るさは最頻値で決める。白地に黒でも暗い背景に白でも同じ扱いになり、
   * 「背景から離れた画素＝文字」と言えるようになる。
   */
  const luma = new Uint8Array(width * height);
  const histogram = new Uint32Array(32);
  for (let i = 0, p = 0; p < luma.length; i += 4, p += 1) {
    // 輝度の近似（緑を重く見る）。`locateTarget` と同じ式
    const value = Math.round((data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10);
    luma[p] = value;
    histogram[value >> 3] += 1;
  }
  let bucket = 0;
  for (let index = 1; index < histogram.length; index += 1) {
    if (histogram[index] > histogram[bucket]) bucket = index;
  }
  const background = bucket * 8 + 4;
  const isInk = (x, y) => Math.abs(luma[y * width + x] - background) > TEXT_INK_DELTA;

  const pointX = Math.min(Math.max(Math.round(point.x * dpr * scale), 0), width - 1);
  const pointY = Math.min(Math.max(Math.round((point.y * dpr - sy) * scale), 0), height - 1);

  // 行の縦の範囲は、指した位置の近くだけを見て測る（別の段の行に引きずられないため）
  const from = Math.max(pointX - TEXT_LOCAL_WINDOW, 0);
  const to = Math.min(pointX + TEXT_LOCAL_WINDOW, width - 1);
  const rowHasInk = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = from; x <= to; x += 1) {
      if (isInk(x, y)) {
        rowHasInk[y] = 1;
        break;
      }
    }
  }

  // 指した行。少し外していても、いちばん近い行に寄せる
  const reach = Math.max(2, Math.round(height * 0.25));
  let seed = -1;
  for (let distance = 0; distance <= reach && seed < 0; distance += 1) {
    if (pointY - distance >= 0 && rowHasInk[pointY - distance]) seed = pointY - distance;
    else if (pointY + distance < height && rowHasInk[pointY + distance]) seed = pointY + distance;
  }
  if (seed < 0) return null;

  let top = seed;
  for (let y = seed - 1, gap = 0; y >= 0; y -= 1) {
    if (rowHasInk[y]) {
      top = y;
      gap = 0;
    } else if ((gap += 1) > TEXT_ROW_GAP) break;
  }
  let bottom = seed;
  for (let y = seed + 1, gap = 0; y < height; y += 1) {
    if (rowHasInk[y]) {
      bottom = y;
      gap = 0;
    } else if ((gap += 1) > TEXT_ROW_GAP) break;
  }
  const lineHeight = bottom - top + 1;

  // 行の範囲を縦に潰して、文字のある列を求める
  const columnHasInk = new Uint8Array(width);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!columnHasInk[x] && isInk(x, y)) columnHasInk[x] = 1;
    }
  }

  const gapLimit = Math.max(4, Math.round(lineHeight * TEXT_GAP_RATIO));
  let left = pointX;
  for (let x = pointX, gap = 0; x >= 0; x -= 1) {
    if (columnHasInk[x]) {
      left = x;
      gap = 0;
    } else if ((gap += 1) > gapLimit) break;
  }
  let right = pointX;
  for (let x = pointX, gap = 0; x < width; x += 1) {
    if (columnHasInk[x]) {
      right = x;
      gap = 0;
    } else if ((gap += 1) > gapLimit) break;
  }

  const margin = Math.max(4, Math.round(lineHeight * TEXT_MARGIN_RATIO));
  const x0 = Math.max(left - margin, 0);
  const x1 = Math.min(right + margin, width - 1);

  // 縮小画像 -> 物理ピクセル -> CSSピクセル
  const cssX = x0 / scale / dpr;
  const cssWidth = (x1 - x0 + 1) / scale / dpr;
  if (cssWidth < TEXT_MIN_WIDTH) return null;

  return { x: cssX, width: cssWidth };
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
 * 読み取り結果を、ビューポート座標（CSSピクセル）つきの候補へ変換する。
 *
 * QRコードでも OCR でも通る。QR固有の手がかり（符号化・モード・バイト列）と
 * OCR固有の手がかり（信頼度）は、渡されたものだけがそのまま候補に乗る。
 * `code.bbox` は切り出し画像内の物理ピクセルであること（単位を混ぜないこと）。
 */
/**
 * 切り出し画像内の物理ピクセル -> キャプチャ画像の物理ピクセル -> CSSピクセル。
 * 切り出し画像には人工的な余白が足してあるので、その分を引く。
 */
function toCssBox(bbox, crop, dpr) {
  return {
    x: Math.round((bbox.x - crop.padding + crop.device.x) / dpr),
    y: Math.round((bbox.y - crop.padding + crop.device.y) / dpr),
    width: Math.round(bbox.width / dpr),
    height: Math.round(bbox.height / dpr),
  };
}

function toCandidate(code, crop, dpr, point) {
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
    // どちらのエンジンが読んだか（パネルの見出しと確認画面の説明を分けるため）
    engine: code.engine ?? 'jsqr',
    // 読み取りの手がかり（確認画面で出す）
    source: code.source,
    modes: code.modes,
    eci: code.eci,
    bytes: code.bytes,
    version: code.version,
    confidence: code.confidence,
    bboxCss: {
      x: Math.round(cssBbox.x),
      y: Math.round(cssBbox.y),
      width: Math.round(cssBbox.width),
      height: Math.round(cssBbox.height),
    },
    /*
     * 行ごとの矩形（仕様書 §5.5）。折り返されたURLを1つの矩形で囲むと、
     * 行末から行頭までの何も無いところまで囲むことになるので、行ごとに出す。
     * 1行のものは `bboxCss` と同じ1つだけが入る。
     */
    bboxesCss: (code.bboxes ?? [code.bbox]).map((box) => toCssBox(box, crop, dpr)),
    bboxInCrop: code.bbox,
    bboxesInCrop: code.bboxes ?? [code.bbox],
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
 * 見つからなければ、同じ位置の帯を OCR にかけて文字からURLを探す。
 *
 * regions は content script が計算した領域の配列で、前から順に試す。
 * 1つ目で見つからなければ、より広い領域へ段階的に広げる
 * （QRコードが切り出し枠より大きい場合の救済。仕様書 §4.6）。
 *
 * **QR を先に試すのは、速く確実（30〜300ms）だから。** OCR はそれより時間がかかる。
 * QRで見つかった時点で OCR は走らせない（仕様書 §9 Phase 1c）。
 *
 * @param {chrome.tabs.Tab} tab
 * @param {{point: {x:number,y:number}, dpr: number,
 *          regions: Array<{x:number,y:number,width:number,height:number}>,
 *          ocrRegion?: {x:number,y:number,width:number,height:number}}} request
 */
/**
 * 画面を1枚撮る。
 *
 * `captureVisibleTab` には毎秒の呼び出し回数の上限があり、続けて指すと
 * 「画面を取得できませんでした」で失敗する。**待てば通るものなので、
 * 1回だけ間を空けて撮り直す。** それでも駄目なら、そのまま失敗として返す。
 */
const CAPTURE_RETRY_WAIT = 700;

async function captureTab(tab) {
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (error) {
    if (!/quota/i.test(String(error))) throw error;
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_RETRY_WAIT));
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  }
}

async function recognize(tab, request, settings) {
  const startedAt = performance.now();

  const shotDataUrl = await captureTab(tab);
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
  /** OCR にかける帯。QRで見つからなかったときだけ用意する。 */
  let band = null;

  try {
    for (const [index, region] of regions.entries()) {
      attemptCount += 1;
      const crop = cropRegion(bitmap, shot, region, dpr);
      // 輪郭に合わせた領域を先頭に足しているので、それが使われたかは index で分かる
      const cropMode = located !== null && index === 0 ? 'located' : 'ladder';
      const candidates = detectQrCodes(crop.canvas).map((code) =>
        toCandidate(code, crop, dpr, point),
      );
      if (used === null || candidates.length > 0) {
        used = { crop, cropMode, engine: 'jsqr', candidates };
      }

      const selected = selectCandidates(candidates);
      if (selected.length > 0) {
        matched = { crop, cropMode, engine: 'jsqr', candidates, selected };
        break;
      }
    }

    /*
     * 切り出しと前処理は、bitmap を閉じる前に済ませてしまう。
     * OCR の応答を待つ間キャプチャ画像（数MB）を抱えたままにしないため。
     */
    if (matched === null && request.ocrRegion) {
      /*
       * 帯の幅は、指した行が横にどこまで続いているかで決める。
       * 固定幅にすると長いURLが端で切れる（`locateTextRun`）。
       * 求まらなければ、content script が計算した固定の帯をそのまま使う。
       */
      const run = locateTextRun(bitmap, shot, point, dpr, request.ocrRegion.height);
      const region = run ? { ...request.ocrRegion, ...run } : request.ocrRegion;
      const crop = cropRegion(bitmap, shot, region, dpr);
      band = { crop, mode: run ? 'line' : 'band', ...preprocessForOcr(crop.canvas, dpr) };
    }
  } finally {
    bitmap.close();
  }

  if (used === null) throw new Error('切り出す領域が指定されていません');

  /** OCR の結果。QRで見つかった場合と、OCR が失敗した場合は null。 */
  let ocr = null;
  if (band !== null) {
    try {
      const read = await runOcr(await canvasToDataUrl(band.canvas));
      /*
       * 折り返されたURLの連結は、設定がONのときだけ行う（仕様書 §5.5）。
       * OFF のときは今までどおり、行ごとに別の文字列として扱う。
       */
      /*
       * 折り返しの連結は、**行の見た目が続いているか**で決める（仕様書 §5.5）。
       * 表示している側がその2行を同じものとして扱っているかどうかが根拠なので、
       * 色と下線を切り出し画像から測って渡す。
       */
      const lines = settings.multilineUrl ? groupWordsIntoLines(read.words) : [];
      const lineStyles = settings.multilineUrl
        ? measureLineStyles(band.crop.canvas, lines, band.scale)
        : [];

      const candidates = findUrlsInWords(read.words, {
        multiline: settings.multilineUrl,
        lineStyles,
      }).map((entry) =>
        toCandidate(
          {
            text: entry.text,
            engine: 'tesseract',
            confidence: entry.confidence,
            bbox: bboxInCropFromOcr(entry.bbox, band),
            bboxes: entry.bboxes.map((box) => bboxInCropFromOcr(box, band)),
          },
          band.crop,
          dpr,
          point,
        ),
      );
      ocr = {
        crop: band.crop,
        cropMode: band.mode,
        engine: 'tesseract',
        candidates,
        /*
         * 行の境目をどう判定したか（仕様書 §5.5）。確認画面に出すためだけのもので、
         * 判定そのものは findUrlsInWords の中で行われている。
         */
        joins: settings.multilineUrl
          ? planLineJoins(lines, lineStyles).map((decision, index) => ({
              from: index + 1,
              to: index + 2,
              ...decision,
            }))
          : [],
        selected: selectCandidates(candidates),
        // 目視確認用。読んだ文字を見せないと、URLが出ない理由が分からない
        text: read.text,
        image: band.canvas,
        imageScale: band.scale,
      };
    } catch (error) {
      // OCR が動かなくても、QRの結果（無しも含む）はそのまま返す
      console.warn('[screink] OCR に失敗しました:', error);
    }
  }

  let result;
  if (matched !== null) {
    result = matched;
  } else if (ocr !== null && ocr.selected.length > 0) {
    result = ocr;
  } else if (ocr === null || used.candidates.some((code) => code.kind === 'undecodable')) {
    /*
     * 何も採用できなかったときに目視確認へ残すのは、手がかりの多い方。
     *
     * QRコードを見つけたのに文字にできなかった場合は、その切り出しを残す
     * （パネルの「読み取れなかった」の判定もこの候補から出している）。
     * それ以外は OCR にかけた帯と読んだ文字を残す。範囲を広げる段階で
     * 画面の反対側のQRコードを拾っていることがあり、それは手がかりにならない。
     */
    result = used;
  } else {
    result = ocr;
  }

  const selected = result.selected ?? [];
  const engine = result.engine;
  const elapsedMs = Math.round(performance.now() - startedAt);

  lastCapture = {
    dataUrl: await canvasToDataUrl(result.image ?? result.crop.canvas),
    device: result.crop.device,
    css: result.crop.css,
    // 画像には人工的な白い余白が付いている。位置を重ねる側はこの分をずらす
    padding: result.crop.padding,
    // 画像は OCR の前処理で拡大されていることがある。候補の位置は切り出し画像の
    // 座標なので、重ねる側はこの倍率をかける
    imageScale: result.imageScale ?? 1,
    cropMode: result.cropMode,
    ocrText: result.text ?? '',
    joins: result.joins ?? [],
    viewportImage: shot,
    dpr,
    clamped: result.crop.clamped,
    point,
    // 目視確認画面には、採用しなかったものも含めてすべて出す
    candidates: result.candidates,
    selectedCount: selected.length,
    attemptCount,
    elapsedMs,
    engine,
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
    candidates: selected,
    /*
     * QRコードとしては見つかったが、どの符号化でも文字にできなかったものがあるか。
     * 「見つからなかった」と「読めなかった」は原因も次の一手も違うので、
     * パネルの文言を分けるために渡す。
     */
    undecodable: result.candidates.some((candidate) => candidate.kind === 'undecodable'),
    chosenIndex: selected.length > 0 ? 0 : -1,
    attemptCount,
    elapsedMs,
    engine,
  };
}

/**
 * OCR が返した語の位置を、切り出し画像の座標（物理ピクセル）へ戻す。
 *
 * OCR にかけた画像は前処理で拡大してあるので、その倍率で割る。
 * 語に対応づけられなかった場合（`findUrlsInWords` が位置を返せなかった場合）は、
 * 帯そのものを位置として扱う。帯は指した位置を中心に切っているため、
 * 「指した場所にある」という判定は成立する。
 */
function bboxInCropFromOcr(bbox, band) {
  if (!bbox) {
    return {
      x: band.crop.padding,
      y: band.crop.padding,
      width: band.crop.device.width,
      height: band.crop.device.height,
    };
  }
  return {
    x: Math.round(bbox.x / band.scale),
    y: Math.round(bbox.y / band.scale),
    width: Math.round(bbox.width / band.scale),
    height: Math.round(bbox.height / band.scale),
  };
}

/* ------------------------------------------------------------------ *
 * OCR（offscreen document 経由）
 * ------------------------------------------------------------------ */

const OFFSCREEN_PATH = 'src/offscreen/ocr.html';

/**
 * OCR を動かすための offscreen document を用意する。
 *
 * Tesseract.js は Web Worker を作るが、service worker の中では Worker を作れない。
 * ページ側（content script）で動かすとページの CSP に縛られる（仕様書 §4.4）ため、
 * 拡張自身の見えないページを立てて、その中で動かす。
 *
 * `offscreen` 権限はこのためだけに使う。サイトへのアクセス権ではない。
 */
let offscreenReady = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  if (contexts.length > 0) return;

  // 同時に2回作ろうとすると失敗するので、作成中は同じ約束を待たせる
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['WORKERS'],
        justification: 'Runs the bundled OCR engine, which needs a Web Worker.',
      })
      .finally(() => {
        offscreenReady = null;
      });
  }
  await offscreenReady;
}

/**
 * 切り出した画像を OCR にかける。
 *
 * @param {string} dataUrl
 * @returns {Promise<{text: string, words: Array<object>, elapsedMs: number}>}
 */
async function runOcr(dataUrl) {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({ type: MESSAGES.OCR_RUN, dataUrl });
  if (!response?.ok) {
    throw new Error(response?.detail ?? 'OCR に失敗しました');
  }
  return response;
}

/**
 * 候補のうち最初のURLを新しいタブで開く（ダイレクトリンク用）。
 *
 * 候補は近い順に並んでいるので、先頭が「指した位置にいちばん近いURL」になる。
 * 開けたらその URL、開かなかった・開けなかったら null を返す。
 *
 * **QRコードと文字とで、確認を省いてよいかの設定を分けている（仕様書 §5.4）。**
 * QRコードは規格に誤り訂正が内蔵されていて、デコードできた結果は正解である。
 * 一方 OCR は1字違いが起きる（実測で `?id=7` が `?id=T7` になった。§17）。
 * 見ずに開いてよいと言えるかどうかが違うので、設定も別にしてある。
 *
 * @param {Array<{kind: string, engine: string, url: string | null}>} candidates
 * @param {{directLink: boolean, directLinkText: boolean}} settings
 */
async function openFirstUrl(candidates, settings) {
  const candidate = candidates.find(
    (entry) =>
      entry.kind === 'url' &&
      (entry.engine === 'tesseract' ? settings.directLinkText : settings.directLink),
  );
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
        // 設定は先に読む。読み取りの途中（折り返しの連結）でも要る
        const settings = await getSettings();
        const result = await recognize(tab, message, settings);
        if (settings.openCaptureInTab) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('src/debug/capture.html') });
        }
        /*
         * ダイレクトリンクがONなら、確認パネルを経ずにここで開く。
         * QRコードと文字とで設定が分かれている（仕様書 §5.4）。
         *
         * 開く直前に `toSafeUrl()` を通すのは、確認を挟む経路と同じ。
         * 確認UIを省いても、http / https 以外を開かないという保証は変わらない
         * （仕様書 §5.2・§5.4）。
         *
         * URLでない候補（テキストのQRコード）や、見つからなかった場合は開かない。
         * その場合は今までどおりパネルを出す。
         */
        const opened = await openFirstUrl(result.candidates, settings);
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

  /*
   * 画像を OCR にかけるだけの入口。照準モードの経路（`recognize`）とは別に、
   * 精度計測のハーネス（`work/e2e/ocr-lab.mjs`）から画像を直接渡すために残してある。
   */
  if (type === MESSAGES.OCR) {
    (async () => {
      try {
        const result = await runOcr(message.dataUrl);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({ ok: false, reason: 'ocr-failed', detail: String(error) });
      }
    })();
    return true;
  }

  if (type === MESSAGES.GET_LAST_CAPTURE) {
    sendResponse({ ok: true, capture: lastCapture });
    return false;
  }

  return false;
});
