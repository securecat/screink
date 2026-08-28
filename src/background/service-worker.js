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

import { getSettings } from '../shared/settings.js';
import { toSafeUrl } from '../shared/url.js';
import jsQR from '../vendor/jsqr/index.js';

const MESSAGES = {
  TOGGLE_AIM_MODE: 'screink:toggle-aim-mode',
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
 * 2回目以降の注入では、注入先の isolated world に残っている
 * コントローラが toggle として振る舞う（aim-mode.js 冒頭を参照）。
 */
async function toggleAimMode(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId, allFrames: false },
    files: ['src/content/aim-mode.css'],
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

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);

  return {
    canvas,
    device: { x, y, width, height },
    css: { x: region.x, y: region.y, width: region.width, height: region.height },
    clamped: x !== rawX || y !== rawY || width !== rawW || height !== rawH,
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
  const work = new OffscreenCanvas(source.width, source.height);
  const ctx = work.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(source, 0, 0);

  const found = [];
  for (let attempt = 0; attempt < MAX_QR_CANDIDATES; attempt += 1) {
    const image = ctx.getImageData(0, 0, work.width, work.height);
    // attemptBoth：白地に黒／黒地に白のどちらも試す。暗い背景のスライド向け。
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!code || typeof code.data !== 'string' || code.data === '') break;

    const bbox = bboxOfLocation(code.location);
    found.push({ text: code.data, version: code.version, bbox });

    if (bbox.width <= 0 || bbox.height <= 0) break;
    // 見つけた領域を潰して次を探す
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bbox.x - 2, bbox.y - 2, bbox.width + 4, bbox.height + 4);
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
  const cssBbox = {
    x: (code.bbox.x + crop.device.x) / dpr,
    y: (code.bbox.y + crop.device.y) / dpr,
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
    kind: url ? 'url' : 'text',
    text: code.text,
    url,
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
    .filter((candidate) => candidate.near)
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
  const regions = Array.isArray(request.regions) && request.regions.length > 0
    ? request.regions
    : [];

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
    chosenIndex: result.selected.length > 0 ? 0 : -1,
    attemptCount,
    elapsedMs,
    engine: 'jsqr',
  };
}

/* ------------------------------------------------------------------ *
 * イベント
 * ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-aim-mode') return;
  const target = tab ?? (await getActiveTab());
  if (!target?.id) return;
  try {
    await toggleAimMode(target.id);
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

  if (type === MESSAGES.TOGGLE_AIM_MODE) {
    (async () => {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, reason: 'no-active-tab' });
        return;
      }
      try {
        await toggleAimMode(tab.id);
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
        sendResponse({ ok: true, ...result, openedInTab: settings.openCaptureInTab });
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
