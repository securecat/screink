/**
 * 設定の既定値と読み書き。
 *
 * ここに保存するのは「設定」だけ。切り出した画像・認識結果・指した位置は
 * 永続化しない（仕様書 §8.2）。
 *
 * 保存先は storage.sync ではなく storage.local を使う。sync は Google アカウント
 * 経由で端末間に同期されるため、わずかとはいえブラウザの外へ出る経路ができる。
 * 同期する価値のある設定を持っていないので、経路を持たない方を選ぶ。
 */

export const DEFAULT_SETTINGS = {
  /**
   * 拡張の表示言語（`'en'` / `'ja'`）。
   *
   * 既定は空文字＝未設定で、そのときはブラウザのUI言語に合わせる
   * （`src/shared/i18n.js` の `resolveLanguage`）。オプション設定で選ぶと、
   * 以降はブラウザの言語に関係なく選んだ言語で表示する。
   *
   * なお、拡張名・説明・ショートカットキーの説明（manifest.json の `__MSG_*__`）は
   * Chrome がブラウザのUI言語で解決するため、この設定では切り替わらない。
   */
  uiLanguage: '',

  /**
   * QRコードを探す領域の基準の一辺（CSSピクセル）。
   *
   * 通常は「指した位置にある対象の輪郭」を切り出すので、この値は使わない。
   * 輪郭が求まらなかったときの保険（指した点を中心に段階的に広げる探索）で
   * 基準として使う。設定画面には出していない（仕様書 §4.6）。
   */
  qrRegionSize: 560,

  /**
   * OCR用の切り出し領域（CSSピクセル）。URLは横に長く縦に薄いため帯にする。
   * Phase 1 で使用する。現時点では未使用のため設定画面には出していない。
   */
  ocrRegionWidth: 960,
  ocrRegionHeight: 200,

  /**
   * 切り出した画像を、確認を待たず新しいタブで開く（PoC の目視確認用）。
   * 会議中にタブが切り替わるのは邪魔なので既定は off。
   * off でも結果パネルのボタンから開ける。
   */
  openCaptureInTab: false,

  /**
   * ダイレクトリンク：URLを読み取れたら、確認パネルを出さずに直ちに新しいタブで開く。
   *
   * 既定は off。読み取った内容を見せてから開くのが基本の作りであり、
   * それを省くのはユーザーが明示的に選んだときだけとする（仕様書 §5.4）。
   * URLでなかった場合・見つからなかった場合は、on でもパネルを出す。
   */
  directLink: false,
};

export const SETTING_LIMITS = {
  qrRegionSize: { min: 160, max: 2000 },
  ocrRegionWidth: { min: 120, max: 4000 },
  ocrRegionHeight: { min: 80, max: 4000 },
};

/** 表示言語は 'en' / 'ja' のみ受け付ける。それ以外は未設定（＝ブラウザに合わせる）とする。 */
function normalizeLanguage(value) {
  return value === 'en' || value === 'ja' ? value : '';
}

/** 数値設定を範囲内に収める。不正値は既定値へ戻す。 */
function clampNumber(key, value) {
  const limits = SETTING_LIMITS[key];
  const fallback = DEFAULT_SETTINGS[key];
  if (!limits) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(n)));
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    uiLanguage: normalizeLanguage(stored.uiLanguage),
    qrRegionSize: clampNumber('qrRegionSize', stored.qrRegionSize),
    ocrRegionWidth: clampNumber('ocrRegionWidth', stored.ocrRegionWidth),
    ocrRegionHeight: clampNumber('ocrRegionHeight', stored.ocrRegionHeight),
    openCaptureInTab: Boolean(stored.openCaptureInTab),
    directLink: Boolean(stored.directLink),
  };
}

function normalizeSetting(key, value) {
  if (key === 'uiLanguage') return normalizeLanguage(value);
  if (key in SETTING_LIMITS) return clampNumber(key, value);
  return Boolean(value);
}

export async function saveSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting: ${key}`);
  const normalized = normalizeSetting(key, value);
  await chrome.storage.local.set({ [key]: normalized });
  return normalized;
}

