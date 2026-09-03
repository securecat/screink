/**
 * OCR で読み取った文中から、URLらしい部分を切り出す。
 *
 * QRコードと違い、OCR の結果は「文章の中にURLが混ざったもの」として返ってくる。
 * 「アンケートは https://example.com/s です。」のような文から、URLの部分だけを取り出す。
 *
 * ここでやるのは**切り出しと、書き方の揺れの正規化まで**。
 * 開いてよいかどうかの判定は `toSafeUrl()`（`src/shared/url.js`）に任せる。
 * 「開いてよいURLはこれだけ」という門を1か所に保つため、ここでは判定しない。
 *
 * **文字の推測はしない。** `examp1e.com` を `example.com` に直すような補正は入れない
 * （仕様書 §5.2）。直すのは、書き方が違うだけで同じものを指していると言えるもの
 * ——全角、スキームの前後に入った空白、句点——に限る。
 */

import { toSafeUrl } from './url.js';

/**
 * URLに現れうる文字。
 *
 * 「URLでない文字が来たら終わり」ではなく「URLに使える文字が続く限り」で切る。
 * 除外する文字を数え上げる方式にすると、日本語の直後で止まらない。
 * `詳細は（https://example.com/a）まで` は NFKC で括弧が半角になるため、
 * 全角括弧を除外しても `)まで` まで飲み込んでしまう（実際にそうなった）。
 *
 * URL はASCIIで書かれる（それ以外はパーセント符号化される）ので、この方が素直。
 */
const URL_CHAR = "[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%]";

/** スキーム付きのURL。 */
const WITH_SCHEME = new RegExp(`https?://${URL_CHAR}+`, 'gi');

/**
 * スキームが省略されたドメイン表記（`www.example.com/x` `github.com/a/b` `example.co.jp`）。
 * 末尾のラベルは英字2文字以上。`3.14` のような数字だけの並びを拾わないため。
 */
const DOMAIN_IN_TEXT = new RegExp(
  `(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,24}(?::\\d{1,5})?(?:/${URL_CHAR}*)?`,
  'gi',
);

/**
 * ファイルの名前をドメインと間違えないための除外。
 * `photo.png` `report.pdf` `index.html` は、スキームも path も無ければURLとして扱わない。
 */
const FILE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
  'pdf', 'html', 'htm', 'xml', 'json', 'txt', 'csv', 'md',
  'js', 'mjs', 'css', 'zip', 'gz', 'exe', 'dmg', 'msi',
  'mp3', 'mp4', 'mov', 'avi', 'wav',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);

/** URLの末尾に紛れ込む記号。文の区切りであって、URLの一部ではない。 */
const TRAILING = /[.,;:!?、。…"'）)\]}>」』】]+$/;

/**
 * 書き方の揺れをそろえる。
 *
 * - NFKC で全角を半角にする（`ｈｔｔｐｓ：／／` → `https://`）
 * - スキームの前後に入った空白を詰める（OCR は `https:// example.com` のように空けがち）
 * - 句点をピリオドにする（`example。com`）。日本語の文中に置かれたURLで実際に起きる
 */
export function normalizeOcrText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[。｡]/g, '.')
    .replace(/\b(https?)\s*:\s*\/\s*\/\s*/gi, '$1://');
}

/** 末尾の記号を落とす。閉じ括弧は、対応する開き括弧が中に無いときだけ落とす。 */
function trimTrailing(candidate) {
  let result = candidate;
  for (;;) {
    const trimmed = result.replace(TRAILING, '');
    if (trimmed === result) return result;
    // `https://example.com/a_(b)` のような、括弧まで含めて1つのURLであるものを守る
    const dropped = result.slice(trimmed.length);
    if (/[)）]/.test(dropped) && /[(（]/.test(trimmed)) return result;
    result = trimmed;
  }
}

/** 見つけた範囲が、すでに採った範囲に含まれているか。 */
function overlaps(ranges, start, end) {
  return ranges.some((range) => start < range.end && end > range.start);
}

/**
 * 文中のURLらしい部分を、現れた順に返す。
 *
 * @param {string} text OCR が読んだ文字列
 * @returns {Array<{text: string, url: string}>} `text` は切り出した文字列、`url` は開ける形
 */
export function findUrlsInText(text) {
  const normalized = normalizeOcrText(text);
  const found = [];
  const ranges = [];
  const seen = new Set();

  const collect = (pattern, requireDomainCheck) => {
    pattern.lastIndex = 0;
    for (;;) {
      const match = pattern.exec(normalized);
      if (!match) break;

      const candidate = trimTrailing(match[0]);
      if (candidate === '') continue;

      const start = match.index;
      const end = start + candidate.length;
      // スキーム付きで採った部分の中を、ドメイン表記として二重に拾わない
      if (overlaps(ranges, start, end)) continue;

      if (requireDomainCheck) {
        const host = candidate.split(/[/:?#]/)[0];
        const tld = host.slice(host.lastIndexOf('.') + 1).toLowerCase();
        // path もスキームも無いファイル名は、URLとして扱わない
        if (FILE_EXTENSIONS.has(tld) && !candidate.includes('/')) continue;
      }

      const url = toSafeUrl(candidate);
      if (!url || seen.has(url)) continue;

      seen.add(url);
      ranges.push({ start, end });
      found.push({ text: candidate, url, start });
    }
  };

  collect(WITH_SCHEME, false);
  collect(DOMAIN_IN_TEXT, true);

  return found
    .sort((a, b) => a.start - b.start)
    .map(({ text: candidate, url }) => ({ text: candidate, url }));
}
