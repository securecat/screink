/**
 * 切り出した画像の目視確認画面（PoC用）。
 *
 * 画像・指した位置・認識できたQRコードの位置を重ねて表示する。
 * 画像は service worker のメモリ上にある直近の結果を受け取るだけで、保存しない。
 */

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
  return [
    `CSS      : x=${capture.css.x} y=${capture.css.y} ${capture.css.width}×${capture.css.height}`,
    `物理px   : x=${capture.device.x} y=${capture.device.y} ${capture.device.width}×${capture.device.height}`,
    `DPR      : ${capture.dpr}`,
    `画面画像 : ${capture.viewportImage.width}×${capture.viewportImage.height}`,
    `指した点 : (${Math.round(capture.point.x)}, ${Math.round(capture.point.y)}) CSS px`,
    `認識     : ${capture.engine} / ${capture.elapsedMs} ms / 試した範囲 ${capture.attemptCount} 段階`,
    capture.clamped ? '※ 画面端のため領域を画面内に収めました' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 切り出し画像の上に、指した位置とQRコードの位置を重ねる。 */
function renderMarkers(capture, image) {
  const scale = () => image.clientWidth / image.naturalWidth;

  const markers = [];

  // 指した位置（切り出し画像内の物理ピクセルへ変換）
  const pointInCrop = {
    x: capture.point.x * capture.dpr - capture.device.x,
    y: capture.point.y * capture.dpr - capture.device.y,
  };
  const crosshair = el('div', 'marker marker--point');
  markers.push({ node: crosshair, place: (k) => {
    crosshair.style.left = `${pointInCrop.x * k}px`;
    crosshair.style.top = `${pointInCrop.y * k}px`;
  } });

  capture.candidates.forEach((candidate, index) => {
    const box = el('div', 'marker marker--box');
    if (candidate.near) box.classList.add('marker--chosen');
    const label = el('span', 'marker__label');
    label.textContent = String(index + 1);
    box.append(label);
    markers.push({ node: box, place: (k) => {
      box.style.left = `${candidate.bboxInCrop.x * k}px`;
      box.style.top = `${candidate.bboxInCrop.y * k}px`;
      box.style.width = `${candidate.bboxInCrop.width * k}px`;
      box.style.height = `${candidate.bboxInCrop.height * k}px`;
    } });
  });

  for (const marker of markers) stage.append(marker.node);

  const place = () => {
    const k = scale();
    for (const marker of markers) marker.place(k);
  };
  place();
  // 画像は max-width で縮むため、幅が変わったら位置を引き直す
  new ResizeObserver(place).observe(image);
}

function renderCandidates(capture) {
  if (capture.candidates.length === 0) {
    const message = el('p', 'note');
    message.textContent = 'この範囲からQRコードは見つかりませんでした。';
    candidatesHost.append(message);
    results.hidden = false;
    return;
  }

  const list = el('ol', 'candidates');
  capture.candidates.forEach((candidate) => {
    const item = el('li', 'candidate');
    if (candidate.near) item.classList.add('candidate--chosen');

    const heading = el('p', 'candidate__heading');
    const kind = candidate.kind === 'url' ? 'URL' : 'テキスト';
    const marks = [
      kind,
      candidate.containsPoint ? '指した位置の中' : `指した位置から ${candidate.distance} px`,
      candidate.near ? '← 採用' : '遠すぎるため不採用',
    ];
    heading.textContent = marks.join(' / ');
    item.append(heading);

    const payload = el('p', 'candidate__payload mono');
    payload.textContent = candidate.url ?? candidate.text;
    item.append(payload);

    if (candidate.kind !== 'url') {
      const why = el('p', 'note');
      why.textContent = 'http / https ではないため、開くボタンは出しません。';
      item.append(why);
    }

    const geometry = el('p', 'note mono');
    geometry.textContent =
      `bbox(切り出し内・物理px): x=${candidate.bboxInCrop.x} y=${candidate.bboxInCrop.y} ` +
      `${candidate.bboxInCrop.width}×${candidate.bboxInCrop.height}` +
      ` / bbox(画面・CSS px): x=${candidate.bboxCss.x} y=${candidate.bboxCss.y} ` +
      `${candidate.bboxCss.width}×${candidate.bboxCss.height}`;
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
  image.alt = '照準モードで指定した位置の周辺を切り出した画像';
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
  statusText.textContent =
    '表示できる画像がありません。照準モードで位置を指定したあとに、この画面を開いてください。';
}
