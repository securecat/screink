/**
 * QRコードのペイロードを文字列にする。
 *
 * なぜ jsQR の結果をそのまま使わないか：
 *
 * jsQR はバイトモードの中身を **UTF-8 と決めつけて** `decodeURIComponent` で復号する。
 * そのため Shift_JIS で書かれた日本語（日本国内のQRコードでは珍しくない）は例外になり、
 * そのチャンクのテキストが空のまま返る。空文字を「読み取れなかった」として扱うと、
 * 日本語のQRコードが「見つからない」ことになってしまう（実機で報告された不具合）。
 *
 * ここでは、jsQR が取り落とした場合にバイト列から自分で復号し直す。
 * バイト列は `binaryData` に残っているため、情報は失われていない。
 *
 * 漢字モード（Shift_JIS を前提とする規格上のモード）は jsQR 自身が変換表を持っており、
 * 通常は成功する。ただし変換表に無い符号は NUL 文字になるので、それも取り落としと見なす。
 */

/**
 * ECI で宣言される符号化のうち、扱うもの。
 * QRコードの規格では ECI で符号化を明示できるが、実際には宣言が無いものも多い。
 */
const ECI_ENCODINGS = new Map([
  [3, 'iso-8859-1'],
  [20, 'shift_jis'],
  [26, 'utf-8'],
]);

/** 候補の符号化を順に試し、最初に成立したものを返す。読めなければ空文字。 */
function decodeBytes(bytes, encodings) {
  const view = new Uint8Array(bytes);
  for (const encoding of encodings) {
    try {
      // fatal: true にしないと、壊れたバイト列が U+FFFD の羅列として「成功」してしまう
      const text = new TextDecoder(encoding, { fatal: true }).decode(view);
      if (text !== '') return text;
    } catch {
      // この符号化では読めない。次を試す
    }
  }
  return '';
}

/** jsQR がそのチャンクの中身を取り落としているか。 */
function isDropped(chunk) {
  const length = chunk?.bytes?.length ?? 0;
  if (length === 0) return false;
  const text = typeof chunk.text === 'string' ? chunk.text : '';
  return text === '' || text.includes('\u0000');
}

/**
 * QRコードの中身と、それをどう読んだか。
 *
 * `source` は読み取った経路を示す。確認画面（`src/debug/`）で、うまく読めなかったときの
 * 手がかりとして出すためにここで返している。
 *   'jsqr'                        jsQR の結果をそのまま使った
 *   'utf-8' / 'shift_jis' / ...   jsQR が取り落としたのでバイト列から復号し直した
 *   ''                            どの符号化でも読めなかった
 *
 * @param {{data?: string, binaryData?: number[],
 *          chunks?: Array<{type?: string, text?: string, bytes?: number[],
 *                          assignmentNumber?: number}>}} code jsQR の返り値
 * @returns {{text: string, source: string, modes: string[], eci: number | null,
 *            bytes: number[]}}
 */
export function readQrPayload(code) {
  const chunks = Array.isArray(code?.chunks) ? code.chunks : [];
  const data = typeof code?.data === 'string' ? code.data : '';
  const bytes = Array.isArray(code?.binaryData) ? code.binaryData : [];

  const declared = chunks.find((chunk) => typeof chunk?.assignmentNumber === 'number');
  const eci = typeof declared?.assignmentNumber === 'number' ? declared.assignmentNumber : null;
  const modes = [...new Set(chunks.map((chunk) => chunk?.type).filter((type) => type && type !== 'eci'))];

  const describe = (text, source) => ({ text, source, modes, eci, bytes });

  // jsQR が全部読めていればそれを使う（ASCII や UTF-8 のQRコードはここで終わる）
  if (data !== '' && !chunks.some(isDropped)) return describe(data, 'jsqr');
  if (bytes.length === 0) return describe(data, data === '' ? '' : 'jsqr');

  /*
   * 試す順番：
   *   1. ECI で宣言されている符号化（宣言があれば、それが作った側の意図）
   *   2. UTF-8（宣言が無いQRコードの多数派）
   *   3. Shift_JIS（日本語で宣言が無い場合の実質的な既定）
   *
   * ASCII しか含まない場合はどれでも同じ結果になるので、順番は問題にならない。
   * 漢字モードのバイト列は Shift_JIS そのものなので、この順番で拾える。
   */
  const encodings = [];
  const fromEci = ECI_ENCODINGS.get(eci);
  if (fromEci) encodings.push(fromEci);
  encodings.push('utf-8', 'shift_jis');

  for (const encoding of encodings) {
    const text = decodeBytes(bytes, [encoding]);
    if (text !== '') return describe(text, encoding);
  }

  // バイト列からは読めなかった。jsQR が部分的に読めていればそれを返す
  return describe(data, data === '' ? '' : 'jsqr');
}
