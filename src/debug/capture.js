const statusText = document.querySelector('#status');
const figure = document.querySelector('#figure');
const image = document.querySelector('#image');
const caption = document.querySelector('#caption');

function describe(capture) {
  return [
    `CSS      : x=${capture.css.x} y=${capture.css.y} ${capture.css.width}×${capture.css.height}`,
    `物理px   : x=${capture.device.x} y=${capture.device.y} ${capture.device.width}×${capture.device.height}`,
    `DPR      : ${capture.dpr}`,
    `画面画像 : ${capture.viewportImage.width}×${capture.viewportImage.height}`,
    capture.clamped ? '※ 画面端のため領域を画面内に収めました' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

let response;
try {
  response = await chrome.runtime.sendMessage({ type: 'screink:get-last-capture' });
} catch (error) {
  response = { ok: false, detail: String(error) };
}

const capture = response?.ok ? response.capture : null;

if (capture?.dataUrl) {
  image.src = capture.dataUrl;
  caption.textContent = describe(capture);
  figure.hidden = false;
  statusText.textContent = '';
} else {
  statusText.textContent =
    '表示できる画像がありません。照準モードで位置を指定したあとに、この画面を開いてください。';
}
