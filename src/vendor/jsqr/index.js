/**
 * jsQR の ES モジュールラッパー。
 *
 * 同梱している `jsqr.umd.js` は upstream の配布ファイル（webpack UMD）を
 * **1バイトも変更せず**置いている。UMD は `module` / `define` が無い環境では
 * `self.jsQR` へ代入するため、ES モジュールから副作用 import して受け取る。
 *
 * upstream を差し替えるときは `jsqr.umd.js` だけを置き換えればよい。
 * 詳細は同ディレクトリの README.md を参照。
 */

import './jsqr.umd.js';

/**
 * @type {(data: Uint8ClampedArray, width: number, height: number,
 *         options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' })
 *         => null | {
 *           data: string,
 *           binaryData: number[],
 *           version: number,
 *           location: {
 *             topLeftCorner: { x: number, y: number },
 *             topRightCorner: { x: number, y: number },
 *             bottomLeftCorner: { x: number, y: number },
 *             bottomRightCorner: { x: number, y: number },
 *           },
 *         }}
 */
const jsQR = self.jsQR;

if (typeof jsQR !== 'function') {
  throw new Error('[screink] jsQR の読み込みに失敗しました');
}

export default jsQR;
