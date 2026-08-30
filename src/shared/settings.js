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
};

export const SETTING_LIMITS = {
  qrRegionSize: { min: 160, max: 2000 },
  ocrRegionWidth: { min: 120, max: 4000 },
  ocrRegionHeight: { min: 80, max: 4000 },
};

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
    qrRegionSize: clampNumber('qrRegionSize', stored.qrRegionSize),
    ocrRegionWidth: clampNumber('ocrRegionWidth', stored.ocrRegionWidth),
    ocrRegionHeight: clampNumber('ocrRegionHeight', stored.ocrRegionHeight),
    openCaptureInTab: Boolean(stored.openCaptureInTab),
  };
}

export async function saveSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting: ${key}`);
  const normalized = key in SETTING_LIMITS ? clampNumber(key, value) : Boolean(value);
  await chrome.storage.local.set({ [key]: normalized });
  return normalized;
}

export async function resetSettings() {
  await chrome.storage.local.set(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
