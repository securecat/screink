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

/* ------------------------------------------------------------------ *
 * 複数行に折り返されたURL（仕様書 §5.5）
 * ------------------------------------------------------------------ */

/**
 * 行送りが起こりうる文字。この後ろで行が変わっても不自然でない。
 * URL の中で折り返しが起きるのは、たいていこれらの後ろ。
 */
const BREAKABLE_TAIL = /[-/_.?&=#,;:~+]$/;

/** 次の行の先頭が、URLの続きとして通る形か。 */
const URL_CHUNK = new RegExp(`^${URL_CHAR}+$`);

/**
 * URLらしさを示す文字。
 *
 * 「URLに使える文字だけでできている」だけでは足りない。`and` も `then` も
 * URLに使える文字だけでできていて、`https://example.com/docsand` を作ってしまう。
 * 区切りや記号を含んでいるかどうかで、**語なのかURLの続きなのか**を分ける。
 *
 * `.` `,` `;` は入れない。英文の語に付いてくるため、区別の役に立たない。
 */
const URL_LOOKING = /[/?#&=_~+%:-]/;

/** それ自体で新しいURLを始めている形。箇条書きでURLが並んだときに連結しないため。 */
const NEW_URL_HEAD = /^(https?:\/\/|www\.)/i;

/** 位置合わせの許容誤差を、行の高さの何倍にするか。 */
const ALIGN_TOLERANCE = 0.6;
/** スタイルが一致しているときは、位置合わせを少し緩める。 */
const ALIGN_TOLERANCE_STYLED = 1.0;
/** 行の右端が「ブロックの右端まで届いている」と見なす差（行の高さの何倍か）。 */
const RIGHT_EDGE_TOLERANCE = 1.0;
/** 隣り合う行と見なす行間（行の高さの何倍まで）。 */
const LINE_GAP_MAX = 0.8;
/** 色が同じと見なす差（RGB の各成分の差の合計）。 */
const COLOR_TOLERANCE = 90;

/** 矩形の並びをまとめた外接矩形。 */
function boundsOf(boxes) {
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

/**
 * 語の並びを行ごとにまとめる。
 *
 * OCR が行番号（`line`）を付けていればそれに従う。無い場合（机上のテストなど）は
 * 縦の重なりから組む。
 *
 * @param {Array<{text: string, bbox: {x0:number,y0:number,x1:number,y1:number},
 *                line?: number}>} words
 * @returns {Array<{index: number, words: Array<object>,
 *                  x0:number, y0:number, x1:number, y1:number, height: number}>}
 */
export function groupWordsIntoLines(words) {
  const list = (Array.isArray(words) ? words : []).filter(
    (word) => word?.bbox && String(word.text ?? '').trim() !== '',
  );
  if (list.length === 0) return [];

  const groups = new Map();
  const hasLineNumbers = list.every((word) => Number.isInteger(word.line));

  if (hasLineNumbers) {
    for (const word of list) {
      if (!groups.has(word.line)) groups.set(word.line, []);
      groups.get(word.line).push(word);
    }
  } else {
    // 縦の中心が、いま組んでいる行の範囲に入るなら同じ行と見なす
    const sorted = [...list].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    let current = null;
    let index = 0;
    for (const word of sorted) {
      const center = (word.bbox.y0 + word.bbox.y1) / 2;
      if (current === null || center < current.y0 || center > current.y1) {
        index += 1;
        current = { y0: word.bbox.y0, y1: word.bbox.y1 };
        groups.set(index, []);
      } else {
        current.y0 = Math.min(current.y0, word.bbox.y0);
        current.y1 = Math.max(current.y1, word.bbox.y1);
      }
      groups.get(index).push(word);
    }
  }

  return [...groups.entries()]
    .map(([index, group]) => {
      const ordered = [...group].sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const bounds = boundsOf(ordered.map((word) => word.bbox));
      return { index, words: ordered, ...bounds, height: bounds.y1 - bounds.y0 };
    })
    .sort((a, b) => a.y0 - b.y0);
}

/** 2つのスタイルが食い違っているか。どちらかが分からなければ食い違いとは言わない。 */
function styleConflicts(a, b) {
  if (!a || !b) return false;
  if (typeof a.underline === 'boolean' && typeof b.underline === 'boolean') {
    if (a.underline !== b.underline) return true;
  }
  if (Array.isArray(a.color) && Array.isArray(b.color)) {
    const difference = a.color.reduce(
      (sum, value, index) => sum + Math.abs(value - (b.color[index] ?? 0)),
      0,
    );
    if (difference > COLOR_TOLERANCE) return true;
  }
  return false;
}

/** 2つのスタイルが揃っていると言えるか（許容誤差を緩める根拠に使う）。 */
function styleMatches(a, b) {
  if (!a || !b) return false;
  if (a.underline !== true || b.underline !== true) {
    if (!Array.isArray(a.color) || !Array.isArray(b.color)) return false;
  }
  return !styleConflicts(a, b);
}

/**
 * 行を1つずつ見て、次の行を前の行の続きと見なしてよいかを決める（仕様書 §5.5）。
 *
 * **すべての条件を満たしたときだけ連結する。** 1つでも外れたらそこで確定し、
 * それより下の行は見ない。
 *
 * @param {Array<object>} lines `groupWordsIntoLines()` の結果
 * @param {Array<{color: number[]|null, underline: boolean|null}>} [styles] 行ごとの見た目
 * @returns {Array<{join: boolean, reason: string}>} 行の境目ごとの判定（要素数は lines.length - 1）
 */
export function planLineJoins(lines, styles = []) {
  const decisions = [];
  if (lines.length < 2) return decisions;

  const blockLeft = Math.min(...lines.map((line) => line.x0));
  const blockRight = Math.max(...lines.map((line) => line.x1));

  /*
   * 行の境目は1つずつ、独立に見る。
   *
   * 切り出しには、指した行とは関係のない行も入る（別の段落、別のURL、隣の
   * テキストボックス）。**どこか1つの境目でつながらなかったからといって、
   * その先の行を見なくてよいわけではない。** 以前ここで打ち切っていて、
   * 実物のスライドで p-portal のURLが連結できなかった（2026-09-05）。
   *
   * URLが途中で止まるのは、この判定の結果として自然にそうなる。
   * 連結は境目が続けて成立している間だけ効くため。
   */
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    const decide = (join, reason) => decisions.push({ join, reason });

    const height = Math.max(line.height, 1);

    // 1. 行が隣接している
    if (next.y0 - line.y1 > height * LINE_GAP_MAX) {
      decide(false, '行が離れている');
      continue;
    }

    // 2. 次の行の先頭が、URLに使える文字だけでできている
    const head = next.words[0];
    const headText = normalizeOcrText(head?.text).replace(/\s+/g, '');
    if (headText === '' || !URL_CHUNK.test(headText)) {
      decide(false, '次の行の先頭がURLの文字ではない');
      continue;
    }

    /*
     * 2'. その塊が「語」ではなく「URLの続き」に見えること。
     *
     * 区切りや記号を含んでいるか、あるいはその行がその塊だけでできているか。
     * これが無いと、URLの次の行に英文が続いているだけで連結してしまう。
     */
    if (!URL_LOOKING.test(headText) && next.words.length > 1) {
      decide(false, '次の行の先頭がただの語に見える');
      continue;
    }

    /*
     * 2''. その塊が、それ自体で新しいURLを始めていないこと。
     * 箇条書きでURLが2行並ぶと、そのままでは1つにつながってしまう。
     */
    if (NEW_URL_HEAD.test(headText)) {
      decide(false, '次の行が別のURLとして始まっている');
      continue;
    }

    // 4. 次の行の先頭の位置が、ブロックの左端か、URLの開始位置に一致する
    const urlStart = line.words.find((word) =>
      NEW_URL_HEAD.test(normalizeOcrText(word.text)),
    );
    const style = styles[line.index];
    const nextStyle = styles[next.index];
    const tolerance =
      height * (styleMatches(style, nextStyle) ? ALIGN_TOLERANCE_STYLED : ALIGN_TOLERANCE);
    const alignedLeft = Math.abs(next.x0 - blockLeft) <= tolerance;
    const alignedUnderUrl =
      urlStart !== undefined && Math.abs(next.x0 - urlStart.bbox.x0) <= tolerance;
    if (!alignedLeft && !alignedUnderUrl) {
      decide(false, '次の行の始まりが揃っていない');
      continue;
    }

    /*
     * 行送りの理由（右端まで届いた／行送りされうる文字で切れた）と、見た目の一致は
     * **条件にしない。記録するだけ。** 手で改行されたURLは、短い行の途中で切れ、
     * 前後で色も下線も変わる。実物（`work/for-screink-url-check-pptx(pdf).pdf` の
     * `https://www.digit` / `al.go.jp/`）がそうなっており、それを弾いてはいけない。
     * 仕様書 §5.5 を参照。
     */
    const remaining = blockRight - line.x1;
    const overflowed = remaining <= height * RIGHT_EDGE_TOLERANCE;
    const tail = normalizeOcrText(line.words[line.words.length - 1]?.text).replace(/\s+/g, '');
    const headWidth = head.bbox.x1 - head.bbox.x0;
    const brokeAtTail = BREAKABLE_TAIL.test(tail) && headWidth > remaining;

    decide(
      true,
      overflowed
        ? '行の右端で折り返している'
        : brokeAtTail
          ? '行送りされうる文字で切れている'
          : styleConflicts(style, nextStyle)
            ? '手で改行された（見た目は変わっている）'
            : '手で改行された',
    );
  }

  return decisions;
}

/**
 * OCR が返した語の並びからURLを取り出し、それを構成した語の外接矩形を添える。
 *
 * 位置が要るのは、指した場所との対応判定（仕様書 §6.1）に載せるため。
 * QRコードは4隅の座標が得られるが、OCR では語ごとの矩形しか得られないので、
 * URLを構成した語をまとめた矩形を作る。
 *
 * 語と切り出した文字列の突き合わせは、空白を取り除いた文字列の上で行う。
 * `https:// example.com` のように、1つのURLが複数の語に割れることがあるためで、
 * `normalizeOcrText()` がその空白を詰めた結果は、語の境界と一致しない。
 * 空白を落としてしまえば、割れていてもいなくても同じ探し方で位置が求まる。
 *
 * @param {Array<{text: string, confidence: number,
 *                bbox: {x0: number, y0: number, x1: number, y1: number}}>} words
 * @returns {Array<{text: string, url: string,
 *                  bbox: {x:number,y:number,width:number,height:number} | null,
 *                  confidence: number | null}>}
 */
export function findUrlsInWords(words, options = {}) {
  const list = Array.isArray(words) ? words : [];

  /*
   * 複数行の連結（仕様書 §5.5）。
   *
   * やっていることは1つだけ——**行の境目を、空白でつなぐか、詰めてつなぐか**。
   * 詰めてつなげば、あとは1行のときと同じ切り出しがそのまま働く。
   * 判定は `planLineJoins()` にあり、ここではその結果を字面に反映するだけ。
   */
  const lines = options.multiline ? groupWordsIntoLines(list) : [];
  const joins = options.multiline ? planLineJoins(lines, options.lineStyles ?? []) : [];

  const lineOf = new Map();
  for (const line of lines) for (const word of line.words) lineOf.set(word, line.index);

  const ordered = options.multiline ? lines.flatMap((line) => line.words) : list;

  const pieces = [];
  let joined = '';
  for (const word of ordered) {
    const text = normalizeOcrText(word?.text).replace(/\s+/g, '');
    if (text === '' || !word?.bbox) continue;
    pieces.push({ start: joined.length, end: joined.length + text.length, word });
    joined += text;
  }

  const spaced = options.multiline
    ? lines
        .map((line, index) => {
          const text = line.words.map((word) => String(word.text ?? '')).join(' ');
          const last = index === lines.length - 1;
          return last ? text : text + (joins[index]?.join ? '' : ' ');
        })
        .join('')
    : list.map((word) => String(word?.text ?? '')).join(' ');
  let cursor = 0;

  return findUrlsInText(spaced).map((entry) => {
    const at = joined.indexOf(entry.text, cursor);
    const parts =
      at < 0
        ? []
        : pieces.filter((piece) => piece.start < at + entry.text.length && piece.end > at);
    if (at >= 0) cursor = at + entry.text.length;

    if (parts.length === 0) {
      // 語に対応づけられなかった場合は位置なしで返す。呼び出し側が切り出し範囲で代替する
      return { text: entry.text, url: entry.url, bbox: null, bboxes: [], confidence: null };
    }

    const bounds = boundsOf(parts.map((piece) => piece.word.bbox));

    /*
     * 行ごとの矩形。2行にまたがるURLを1つの矩形で囲むと、行末から行頭までの
     * 何も無いところまで囲むことになる（仕様書 §5.5）。
     */
    const byLine = new Map();
    for (const piece of parts) {
      const key = lineOf.get(piece.word) ?? 0;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(piece.word.bbox);
    }
    const bboxes = [...byLine.values()].map((boxes) => {
      const box = boundsOf(boxes);
      return { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 };
    });

    return {
      text: entry.text,
      url: entry.url,
      bbox: {
        x: bounds.x0,
        y: bounds.y0,
        width: bounds.x1 - bounds.x0,
        height: bounds.y1 - bounds.y0,
      },
      bboxes,
      // 構成した語のうち最も低い信頼度を採る（1語でも怪しければ怪しい）
      confidence: Math.round(
        Math.min(...parts.map((piece) => Number(piece.word.confidence) || 0)),
      ),
    };
  });
}
