/**
 * 認識結果のテキストを、開いてよいURLへ正規化する。
 *
 * QRコードの中身は攻撃者が自由に決められる。`javascript:` や `data:` を
 * 開かせる細工が普通にあり得るため、**http / https 以外は一切通さない。**
 *
 * この関数は認識時と、実際にタブを開く直前の両方で通す（多重チェック）。
 * 「一度検証したから安全」とは考えないこと。
 */

/** 開いてよいスキーム。ここを増やさないこと。 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * スキームなしでもURLとみなすドメイン表記。
 * 例：`example.com/path` `www.example.com` `docs.google.com/...` `example.co.jp/x`
 *
 * 末尾のラベル（TLD）は英字2文字以上を必須とする。これがないと
 * `not.a` のような、ただテキストにピリオドが入っているだけのものを
 * URLと誤認する。
 */
const BARE_DOMAIN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d{1,5})?(?:[/?#]|$)/i;

/**
 * 制御文字（改行・タブ・NUL・DEL など）を除去し、前後の空白を落とす。
 *
 * 正規表現ではなくコードポイントで判定しているのは、ソース中に
 * 制御文字のエスケープを書かないため（実体が混入すると気づきにくい）。
 */
function clean(text) {
  let result = '';
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) continue;
    result += char;
  }
  return result.trim();
}

/**
 * 開いてよいURLなら正規化した文字列を返す。そうでなければ null。
 *
 * QRコードの中身は誤り訂正込みで正確に得られるため、ここでは
 * OCR向けの曖昧な補正（全角記号の変換など）は行わない。
 * 補正するのはスキームの省略のみ。
 *
 * @param {string} text
 * @returns {string | null}
 */
export function toSafeUrl(text) {
  const candidate = clean(text);
  if (candidate === '') return null;

  // 空白を含むものはURLとして扱わない。QRの中身は正確に取れるため、
  // 空白が入っているならそれは本文であってURLではない。
  if (/\s/.test(candidate)) return null;

  const parsed = parse(candidate);
  if (parsed) return parsed;

  // スキームが省略されたドメイン表記のみ、https を補って再試行する
  if (!candidate.includes('://') && BARE_DOMAIN.test(candidate)) {
    return parse(`https://${candidate}`);
  }

  return null;
}

function parse(candidate) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (url.hostname === '') return null;
  return url.href;
}

/**
 * 表示用にホスト名を取り出す。確認UIで「どこへ行くのか」を目立たせるために使う。
 * @param {string} url
 * @returns {string}
 */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
