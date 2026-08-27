/**
 * screink service worker
 *
 * 役割：
 *   - 照準モードの起動（ショートカットキー / ポップアップからの要求）
 *   - 画面キャプチャと切り出し
 *
 * 画像処理をここで行っているのは意図的。content script 側で canvas や
 * <img src="data:..."> を扱うと、ページ側の CSP（img-src など）に縛られて
 * 会議サービスのような厳しいページで動かなくなる。service worker は拡張自身の
 * CSP 下にあるため、ページの設定に影響されない。
 *
 * また、data URL の復号に fetch() を使わず atob() で行っているのは、
 * manifest.json の `connect-src 'none'` を維持するため。
 * 「送信しない」ではなく「送信できない」構造を保つ（CLAUDE.md 参照）。
 */

import { getSettings } from '../shared/settings.js';

const MESSAGES = {
  TOGGLE_AIM_MODE: 'screink:toggle-aim-mode',
  GET_SETTINGS: 'screink:get-settings',
  CAPTURE_REGION: 'screink:capture-region',
  OPEN_CAPTURE_TAB: 'screink:open-capture-tab',
  GET_LAST_CAPTURE: 'screink:get-last-capture',
};

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
 * アクティブなタブ」以外に一切アクセスできない。
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

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/* ------------------------------------------------------------------ *
 * キャプチャと切り出し
 * ------------------------------------------------------------------ */

/**
 * 可視領域を1枚キャプチャし、指定領域を切り出す。
 *
 * 座標系（CLAUDE.md「座標系の扱い」を参照）：
 *   - region.{x,y,width,height} は CSS ピクセル・ビューポート基準
 *   - captureVisibleTab が返す画像は物理ピクセル（CSS px × devicePixelRatio）
 *   - devicePixelRatio は content script 側で毎回読み直した値を受け取る
 *     （ディスプレイ倍率とページズームの両方を含むため）
 *
 * @param {chrome.tabs.Tab} tab
 * @param {{x:number, y:number, width:number, height:number, dpr:number}} region
 */
async function captureRegion(tab, region) {
  const shotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bitmap = await createImageBitmap(dataUrlToBlob(shotDataUrl));
  // close() したあとは width / height が 0 になるので先に取っておく
  const shot = { width: bitmap.width, height: bitmap.height };

  const dpr = Number.isFinite(region.dpr) && region.dpr > 0 ? region.dpr : 1;

  // CSS px -> 物理 px へ変換し、画像の範囲内へ収める
  const rawX = Math.round(region.x * dpr);
  const rawY = Math.round(region.y * dpr);
  const rawW = Math.round(region.width * dpr);
  const rawH = Math.round(region.height * dpr);

  const sx = Math.min(Math.max(rawX, 0), Math.max(shot.width - 1, 0));
  const sy = Math.min(Math.max(rawY, 0), Math.max(shot.height - 1, 0));
  const sw = Math.max(Math.min(rawW, shot.width - sx), 1);
  const sh = Math.max(Math.min(rawH, shot.height - sy), 1);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await blobToDataUrl(blob);

  const result = {
    dataUrl,
    device: { x: sx, y: sy, width: sw, height: sh },
    css: { x: region.x, y: region.y, width: region.width, height: region.height },
    viewportImage: { width: shot.width, height: shot.height },
    dpr,
    clamped: sw !== rawW || sh !== rawH || sx !== rawX || sy !== rawY,
  };

  lastCapture = result;
  return result;
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

  if (type === MESSAGES.CAPTURE_REGION) {
    (async () => {
      const tab = sender.tab ?? (await getActiveTab());
      if (!tab?.id) {
        sendResponse({ ok: false, reason: 'no-active-tab' });
        return;
      }
      try {
        const result = await captureRegion(tab, message.region);
        const settings = await getSettings();
        if (settings.openCaptureInTab) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('src/debug/capture.html') });
        }
        // 画像本体は content script へ渡さない（ページ側 CSP に縛られるため）。
        // 表示は拡張ページ側（src/debug/）で行う。
        sendResponse({
          ok: true,
          result: { ...result, dataUrl: undefined },
          openedInTab: settings.openCaptureInTab,
        });
      } catch (error) {
        sendResponse({ ok: false, reason: 'capture-failed', detail: String(error) });
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
