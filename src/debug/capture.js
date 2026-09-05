/**
 * 読み取った画像の確認画面。
 *
 * 画像・指した位置・見つかったもの（QRコード / 文字から取り出したURL）の位置を
 * 重ねて表示する。
 * 画像は service worker のメモリ上にある直近の結果を受け取るだけで、保存しない。
 */

import { localizePage, setLanguage, t } from '../shared/i18n.js';
import { getSettings } from '../shared/settings.js';

// まずブラウザのUI言語で組み立て、設定を読んでから作り直す（popup.js と同じ）
localizePage('debugTitle');
setLanguage((await getSettings().catch(() => ({}))).uiLanguage);
localizePage('debugTitle');

const statusText = document.querySelector('#status');
const figure = document.querySelector('#figure');
const stage = document.querySelector('#stage');
const caption = document.querySelector('#caption');
const results = document.querySelector('#results');
const candidatesHost = document.querySelector('#candidates');

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** 切り出しの方式（どうやってこの範囲を決めたか）。 */
const CROP_MODE_KEYS = {
  located: 'debugCropLocated',
  ladder: 'debugCropLadder',
  band: 'debugCropBand',
  line: 'debugCropLine',
};

function describeGeometry(capture) {
  const pad = (label) => `${label}:`.padEnd(16);
  return [
    `${pad(t('debugLabelCss'))}x=${capture.css.x} y=${capture.css.y} ${capture.css.width}×${capture.css.height}`,
    `${pad(t('debugLabelDevice'))}x=${capture.device.x} y=${capture.device.y} ${capture.device.width}×${capture.device.height}`,
    `${pad(t('debugLabelDpr'))}${capture.dpr}`,
    `${pad(t('debugLabelShot'))}${capture.viewportImage.width}×${capture.viewportImage.height}`,
    `${pad(t('debugLabelPoint'))}(${Math.round(capture.point.x)}, ${Math.round(capture.point.y)})`,
    `${pad(t('debugLabelPadding'))}${capture.padding ?? 0} px`,
    // OCR の前処理で拡大した場合だけ出す（QRは等倍のまま走査する）
    (capture.imageScale ?? 1) !== 1
      ? `${pad(t('debugLabelUpscale'))}×${capture.imageScale.toFixed(2)}`
      : '',
    `${pad(t('debugLabelCropMode'))}${t(CROP_MODE_KEYS[capture.cropMode] ?? 'debugCropLadder')}`,
    `${pad(t('debugLabelEngine'))}${capture.engine} / ${capture.elapsedMs} ms`,
    capture.clamped ? t('debugClamped') : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 読み取った画像の上に、指した位置とQRコードの位置を重ねる。 */
function renderMarkers(capture, image) {
  const markers = [];

  // 指した位置（画像内の物理ピクセルへ変換）。
  // 画像の周囲には白い縁が足してあるので、その分ずらす。
  const padding = capture.padding ?? 0;
  const pointInCrop = {
    x: capture.point.x * capture.dpr - capture.device.x + padding,
    y: capture.point.y * capture.dpr - capture.device.y + padding,
  };
  const crosshair = el('div', 'marker marker--point');
  markers.push({
    node: crosshair,
    place: (k) => {
      crosshair.style.left = `${pointInCrop.x * k}px`;
      crosshair.style.top = `${pointInCrop.y * k}px`;
    },
  });

  capture.candidates.forEach((candidate, index) => {
    // 折り返されたURLは行ごとに囲む（仕様書 §5.5）。番号は最初の行にだけ付ける
    const boxes = candidate.bboxesInCrop ?? [candidate.bboxInCrop];
    boxes.forEach((bbox, part) => {
      const box = el('div', 'marker marker--box');
      if (candidate.near) box.classList.add('marker--chosen');
      if (part === 0) {
        const label = el('span', 'marker__label');
        label.textContent = String(index + 1);
        box.append(label);
      }
      markers.push({
        node: box,
        place: (k) => {
          box.style.left = `${bbox.x * k}px`;
          box.style.top = `${bbox.y * k}px`;
          box.style.width = `${bbox.width * k}px`;
          box.style.height = `${bbox.height * k}px`;
        },
      });
    });
  });

  for (const marker of markers) stage.append(marker.node);

  const place = () => {
    /*
     * マーカーの位置は切り出し画像の物理ピクセルで来る。表示している画像は
     * OCR の前処理で拡大されていることがあるので、その倍率をかけてから
     * 画面上の表示倍率へ落とす。
     */
    const k = (image.clientWidth / image.naturalWidth) * (capture.imageScale ?? 1);
    for (const marker of markers) marker.place(k);
  };
  place();
  // 画像は max-width で縮むため、幅が変わったら位置を引き直す
  new ResizeObserver(place).observe(image);
}

/** 読み取りの経路を1行で説明する（うまく読めなかったときの手がかり）。 */
function describeDecoding(candidate) {
  if (candidate.engine === 'tesseract') {
    return t('debugDecodedOcr', [String(candidate.confidence ?? '—')]);
  }
  if (candidate.source === 'jsqr') return t('debugDecodedJsqr');
  if (candidate.source) return t('debugDecodedRecovered', [candidate.source]);
  return t('debugDecodedFailed');
}

/** QRコードのモード（と ECI の宣言）を1行にする。 */
function describeModes(candidate) {
  const modes = Array.isArray(candidate.modes) ? candidate.modes : [];
  const parts = [modes.length > 0 ? modes.join(' + ') : '—'];
  if (typeof candidate.eci === 'number') parts.push(`ECI ${candidate.eci}`);
  if (typeof candidate.version === 'number') parts.push(`version ${candidate.version}`);
  return parts.join(' / ');
}

/**
 * バイト列を16進で出す。
 *
 * 符号化を判定できなかったQRコードは、これが唯一の手がかりになる。
 * 全部出すと長くなりすぎるので先頭だけにし、残りの数を添える。
 */
const BYTES_SHOWN = 96;

function describeBytes(bytes) {
  const shown = bytes
    .slice(0, BYTES_SHOWN)
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
  const rest = bytes.length - BYTES_SHOWN;
  return rest > 0 ? `${shown} ${t('debugBytesMore', [String(rest)])}` : shown;
}

/**
 * OCR が読んだ文字をそのまま出す。
 * URLが出てこないとき、「文字を読めていない」のか「読めたがURLとして
 * 切り出せていない」のかは、これを見ないと分けられない。
 */
function renderOcrText(capture) {
  const text = typeof capture.ocrText === 'string' ? capture.ocrText.trim() : '';
  if (text === '') return;

  const heading = el('p', 'note');
  heading.textContent = `${t('debugLabelOcrText')}:`;
  const body = el('p', 'ocr-text mono');
  body.textContent = text;
  candidatesHost.append(heading, body);
}

function renderCandidates(capture) {
  renderOcrText(capture);

  if (capture.candidates.length === 0) {
    const message = el('p', 'note');
    message.textContent = t('debugNoCode');
    candidatesHost.append(message);
    results.hidden = false;
    return;
  }

  const list = el('ol', 'candidates');
  capture.candidates.forEach((candidate) => {
    const item = el('li', 'candidate');
    if (candidate.near) item.classList.add('candidate--chosen');

    const kindKey = {
      url: 'debugKindUrl',
      text: 'debugKindText',
      undecodable: 'debugKindUndecodable',
    }[candidate.kind] ?? 'debugKindText';

    const heading = el('p', 'candidate__heading');
    heading.textContent = [
      t(kindKey),
      candidate.containsPoint
        ? t('debugInsidePoint')
        : t('debugDistance', [String(candidate.distance)]),
      t(candidate.near && candidate.kind !== 'undecodable' ? 'debugAccepted' : 'debugRejected'),
    ].join(' / ');
    item.append(heading);

    const text = candidate.url ?? candidate.text;
    if (text !== '') {
      const payload = el('p', 'candidate__payload mono');
      payload.textContent = text;
      item.append(payload);
    }

    if (candidate.kind === 'text') {
      const why = el('p', 'note');
      why.textContent = t('debugNotUrl');
      item.append(why);
    }

    /*
     * どう読んだか（符号化・モード・バイト列）。
     * 「読み取れなかった」ときはここだけが手がかりになる。
     */
    const decoding = el('p', 'note mono');
    // モードとバイト列はQRコード固有の話。OCR の候補には出さない
    decoding.textContent =
      candidate.engine === 'tesseract'
        ? `${t('debugLabelDecoded')}: ${describeDecoding(candidate)}`
        : `${t('debugLabelDecoded')}: ${describeDecoding(candidate)} / ${t(
            'debugLabelMode',
          )}: ${describeModes(candidate)}`;
    item.append(decoding);

    const bytes = Array.isArray(candidate.bytes) ? candidate.bytes : [];
    if (bytes.length > 0) {
      const byteLine = el('p', 'note mono candidate__bytes');
      byteLine.textContent = `${t('debugLabelBytes')} (${bytes.length}): ${describeBytes(bytes)}`;
      item.append(byteLine);
    }

    const geometry = el('p', 'note mono');
    geometry.textContent =
      `bbox: x=${candidate.bboxInCrop.x} y=${candidate.bboxInCrop.y} ` +
      `${candidate.bboxInCrop.width}×${candidate.bboxInCrop.height}` +
      ` / x=${candidate.bboxCss.x} y=${candidate.bboxCss.y} ` +
      `${candidate.bboxCss.width}×${candidate.bboxCss.height} (CSS)`;
    item.append(geometry);

    list.append(item);
  });

  candidatesHost.append(list);
  results.hidden = false;
}

let response;
try {
  response = await chrome.runtime.sendMessage({ type: 'screink:get-last-capture' });
} catch (error) {
  response = { ok: false, detail: String(error) };
}

const capture = response?.ok ? response.capture : null;

if (capture?.dataUrl) {
  const image = el('img', 'crop');
  image.alt = t('debugImageAlt');
  image.src = capture.dataUrl;
  stage.append(image);

  caption.textContent = describeGeometry(capture);
  figure.hidden = false;

  if (image.complete && image.naturalWidth > 0) {
    renderMarkers(capture, image);
  } else {
    image.addEventListener('load', () => renderMarkers(capture, image), { once: true });
  }

  renderCandidates(capture);
  statusText.textContent = '';
} else {
  statusText.textContent = t('debugNoImage');
}
