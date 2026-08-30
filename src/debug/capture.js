/**
 * 読み取った画像の確認画面。
 *
 * 画像・指した位置・見つかったQRコードの位置を重ねて表示する。
 * 画像は service worker のメモリ上にある直近の結果を受け取るだけで、保存しない。
 */

import { localizePage, t } from '../shared/i18n.js';

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

function describeGeometry(capture) {
  const pad = (label) => `${label}:`.padEnd(16);
  return [
    `${pad(t('debugLabelCss'))}x=${capture.css.x} y=${capture.css.y} ${capture.css.width}×${capture.css.height}`,
    `${pad(t('debugLabelDevice'))}x=${capture.device.x} y=${capture.device.y} ${capture.device.width}×${capture.device.height}`,
    `${pad(t('debugLabelDpr'))}${capture.dpr}`,
    `${pad(t('debugLabelShot'))}${capture.viewportImage.width}×${capture.viewportImage.height}`,
    `${pad(t('debugLabelPoint'))}(${Math.round(capture.point.x)}, ${Math.round(capture.point.y)})`,
    `${pad(t('debugLabelPadding'))}${capture.padding ?? 0} px`,
    `${pad(t('debugLabelCropMode'))}${t(capture.locatedTarget ? 'debugCropLocated' : 'debugCropLadder')}`,
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
    const box = el('div', 'marker marker--box');
    if (candidate.near) box.classList.add('marker--chosen');
    const label = el('span', 'marker__label');
    label.textContent = String(index + 1);
    box.append(label);
    markers.push({
      node: box,
      place: (k) => {
        box.style.left = `${candidate.bboxInCrop.x * k}px`;
        box.style.top = `${candidate.bboxInCrop.y * k}px`;
        box.style.width = `${candidate.bboxInCrop.width * k}px`;
        box.style.height = `${candidate.bboxInCrop.height * k}px`;
      },
    });
  });

  for (const marker of markers) stage.append(marker.node);

  const place = () => {
    const k = image.clientWidth / image.naturalWidth;
    for (const marker of markers) marker.place(k);
  };
  place();
  // 画像は max-width で縮むため、幅が変わったら位置を引き直す
  new ResizeObserver(place).observe(image);
}

function renderCandidates(capture) {
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

    const heading = el('p', 'candidate__heading');
    heading.textContent = [
      t(candidate.kind === 'url' ? 'debugKindUrl' : 'debugKindText'),
      candidate.containsPoint
        ? t('debugInsidePoint')
        : t('debugDistance', [String(candidate.distance)]),
      t(candidate.near ? 'debugAccepted' : 'debugRejected'),
    ].join(' / ');
    item.append(heading);

    const payload = el('p', 'candidate__payload mono');
    payload.textContent = candidate.url ?? candidate.text;
    item.append(payload);

    if (candidate.kind !== 'url') {
      const why = el('p', 'note');
      why.textContent = t('debugNotUrl');
      item.append(why);
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
