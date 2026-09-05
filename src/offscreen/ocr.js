/**
 * OCR の実行（offscreen document 内）。
 *
 * service worker から画像（data URL）を受け取り、読み取った文字列と、
 * 語ごとの位置（bounding box）を返す。
 *
 * ここで動かしているのは同梱した Tesseract.js とエンジンだけで、
 * ネットワークへは出ない。読み込むパスはすべて chrome-extension:// 配下である
 * （manifest の CSP は `connect-src 'self'`。外部ホストは1つも許可していない）。
 */

const MESSAGES = {
  OCR_RUN: 'screink:ocr-run',
};

/**
 * 認識に使う言語とエンジン。
 *
 * 英語だけを積んでいる。URL は ASCII で書かれるため `eng` で足りる。
 * 日本語のモデルは十数MB級で読み込みも遅く、URL 自体の精度に寄与しない（仕様書 §5.3）。
 *
 * OEM 1 = LSTM のみ。同梱しているエンジンが LSTM 専用のビルドなので、これに合わせる。
 */
const LANGUAGE = 'eng';
const OEM_LSTM_ONLY = 1;

const paths = {
  workerPath: chrome.runtime.getURL('src/vendor/tesseract/worker.min.js'),
  corePath: chrome.runtime.getURL('src/vendor/tesseract/tesseract-core-simd-lstm.js'),
  langPath: chrome.runtime.getURL('src/vendor/tesseract/tessdata'),
};

/** 使い回す worker。最初の1回だけ作り、以降は再利用する（作成に時間がかかるため）。 */
let workerPromise = null;

function getWorker() {
  if (workerPromise) return workerPromise;

  workerPromise = window.Tesseract.createWorker(LANGUAGE, OEM_LSTM_ONLY, {
    ...paths,
    // 同梱している学習データは gzip 済み（upstream の配布ファイルのまま）
    gzip: true,
    /*
     * worker を Blob 経由にしない。拡張のパスから直接読み込ませる。
     * 経路が1つ減り、どのファイルを読んでいるかが manifest から追える。
     */
    workerBlobURL: false,
    /*
     * 学習データを IndexedDB に溜めない。
     * 同梱ファイルなので毎回そこから読めばよく、拡張の外に残すものを増やさない
     * （仕様書 §8.2「保存しない」）。
     */
    cacheMethod: 'none',
  }).catch((error) => {
    // 失敗したら次の要求でやり直せるように捨てる
    workerPromise = null;
    throw error;
  });

  return workerPromise;
}

/**
 * @param {string} dataUrl 切り出した画像
 * @returns {Promise<{text: string, words: Array<{text: string, confidence: number,
 *                    bbox: {x0: number, y0: number, x1: number, y1: number}}>}>}
 */
async function recognize(dataUrl) {
  const worker = await getWorker();

  /*
   * 語ごとの位置は、指した位置との対応判定に使う（仕様書 §6）。
   *
   * Tesseract.js 6 以降は、既定では文字列しか返さない。位置を得るには
   * `blocks` を要求して、block > paragraph > line > word とたどる必要がある。
   */
  const { data } = await worker.recognize(dataUrl, {}, { text: true, blocks: true });

  /*
   * 語には行番号を添える。折り返されたURLの連結（仕様書 §5.5）で、
   * どの語が同じ行にあるのかが要る。矩形から組み直すこともできるが、
   * ここで分かっているものを捨てる必要はない。
   */
  const words = [];
  let lineNumber = 0;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: word.bbox,
            line: lineNumber,
          });
        }
        lineNumber += 1;
      }
    }
  }

  return {
    text: typeof data.text === 'string' ? data.text : '',
    words,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MESSAGES.OCR_RUN) return false;

  (async () => {
    const startedAt = performance.now();
    try {
      const result = await recognize(message.dataUrl);
      sendResponse({ ok: true, ...result, elapsedMs: Math.round(performance.now() - startedAt) });
    } catch (error) {
      sendResponse({ ok: false, reason: 'ocr-failed', detail: String(error) });
    }
  })();

  return true;
});
