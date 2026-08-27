/**
 * 設定の既定値と読み書き。
 *
 * ここに保存するのは「設定」だけ。切り出した画像・認識結果・指した位置は
 * 永続化しない（CLAUDE.md「ネットワーク送信を『できない構造』にする」参照）。
 */

export const DEFAULT_SETTINGS = {
  /** 切り出し領域の幅（CSSピクセル） */
  regionWidth: 960,
  /** 切り出し領域の高さ（CSSピクセル） */
  regionHeight: 320,
  /** 照準モード中に切り出し領域の枠を表示する */
  showRegionOutline: true,
  /**
   * 切り出した画像を、確認を待たず新しいタブで開く（PoC の目視確認用）。
   * 会議中にタブが切り替わるのは邪魔なので既定は off。
   * off でも結果パネルのボタンから開ける。
   */
  openCaptureInTab: false,
};

export const SETTING_LIMITS = {
  regionWidth: { min: 120, max: 4000 },
  regionHeight: { min: 80, max: 4000 },
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
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    regionWidth: clampNumber('regionWidth', stored.regionWidth),
    regionHeight: clampNumber('regionHeight', stored.regionHeight),
    showRegionOutline: Boolean(stored.showRegionOutline),
    openCaptureInTab: Boolean(stored.openCaptureInTab),
  };
}

export async function saveSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting: ${key}`);
  const normalized = key in SETTING_LIMITS ? clampNumber(key, value) : Boolean(value);
  await chrome.storage.sync.set({ [key]: normalized });
  return normalized;
}

export async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
