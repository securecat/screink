import { DEFAULT_SETTINGS, getSettings, saveSetting } from '../shared/settings.js';
import { localizePage, resolveLanguage, setLanguage, t } from '../shared/i18n.js';
import { getAimModeShortcut } from '../shared/commands.js';

/*
 * まずブラウザのUI言語で組み立てる。
 * HTML に書いてある既定の文言は英語なので、設定の読み込み（非同期）を待ってから
 * 差し替えると、日本語の環境で英語が一瞬見えることになる。
 */
localizePage('optionsTitle');

// 設定を読んで、選ばれている言語で作り直す
const settings = await getSettings().catch(() => ({ ...DEFAULT_SETTINGS }));
setLanguage(settings.uiLanguage);
localizePage('optionsTitle');

const languageStatus = document.querySelector('#language-status');
const shortcutText = document.querySelector('#shortcut');
const shortcutsButton = document.querySelector('#open-shortcuts');
const languageInputs = [...document.querySelectorAll('input[name="uiLanguage"]')];

/** チェックボックスの設定。設定名と、操作した行に出す「保存できた」の表示。 */
const checkboxFields = {
  directLinkText: {
    input: document.querySelector('#direct-link-text'),
    status: document.querySelector('#direct-link-text-status'),
  },
  openCaptureInTab: {
    input: document.querySelector('#open-capture-in-tab'),
    status: document.querySelector('#status'),
  },
};

/*
 * 保存できたことの表示は状態として持っておく。
 * 表示言語を切り替えたときに、出したままの文言も新しい言語で作り直すため。
 *
 * どちらも「何をどうしたか」を文言で伝える。色だけで伝えない。
 */
const savedChecks = {};
let savedLanguage = null;

/*
 * ショートカットキーの表記は実際の割り当てから作る（popup.js と同じ理由）。
 * 取得は非同期なので、分かるまでは「未設定」として出しておき、届いたら作り直す。
 */
let shortcut = '';

/** 辞書から動的に作っている文字列を作り直す（`data-i18n` の分は localizePage が見る）。 */
function renderTexts() {
  shortcutText.textContent = shortcut
    ? t('optionsShortcutBody', [shortcut])
    : t('optionsShortcutNone');

  for (const [key, field] of Object.entries(checkboxFields)) {
    const saved = savedChecks[key];
    field.status.textContent =
      saved === undefined || saved === null ? '' : t(saved ? 'optionsSavedOn' : 'optionsSavedOff');
  }

  languageStatus.textContent =
    savedLanguage === null
      ? ''
      : t(savedLanguage === 'ja' ? 'optionsSavedLanguageJapanese' : 'optionsSavedLanguageEnglish');
}

function populate(current) {
  for (const [key, field] of Object.entries(checkboxFields)) field.input.checked = current[key];

  // 未設定のときはブラウザのUI言語に合わせた側を選んでおく
  const language = resolveLanguage(current.uiLanguage);
  for (const input of languageInputs) input.checked = input.value === language;
}

/*
 * 保存できたことの表示は、そのコントロールを操作しているあいだは残し、
 * 他のコントロールへフォーカスが移った時点で消す。
 *
 * 時間で勝手に消してはいけないが、ユーザーの注視が別へ移ったことが明白な
 * タイミングでは消してよい（A11Y.md「操作結果のフィードバックメッセージや
 * ステータスメッセージを自動消去しないこと」）。ページから離れるまで待つのは遅すぎる。
 *
 * 以前これをやめていた時期があるが、それは表示が設定の下の行にあり、消えると
 * レイアウトが動いて、直後のボタンを押そうとした瞬間に位置がずれて押せなく
 * なっていたため。いまは表示をラベルと同じ行に置いてあるので、消えても何も動かない。
 */
document.addEventListener('focusin', (event) => {
  // 操作中のコントロールの表示だけ残す
  for (const [key, field] of Object.entries(checkboxFields)) {
    if (field.input !== event.target) savedChecks[key] = null;
  }
  if (!languageInputs.includes(event.target)) savedLanguage = null;
  renderTexts();
});

for (const [key, field] of Object.entries(checkboxFields)) {
  field.input.addEventListener('change', async () => {
    await saveSetting(key, field.input.checked);
    savedChecks[key] = field.input.checked;
    renderTexts();
  });
}

/*
 * 表示言語はその場で切り替える。設定した結果を、設定した画面で読めるようにする。
 * 照準モードのオーバーレイは、次に開始したときから新しい言語になる
 * （service worker が注入時に辞書を渡すため。service-worker.js を参照）。
 */
for (const input of languageInputs) {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    await saveSetting('uiLanguage', input.value);
    setLanguage(input.value);
    savedLanguage = input.value;
    localizePage('optionsTitle');
    renderTexts();
  });
}

/*
 * ページから離れたら消す。
 * 次に戻ってきたときに、いつのものとも分からない結果が残っていない状態にする。
 * 離れているあいだの消去なので、操作の瞬間にレイアウトが動くことはない。
 */
window.addEventListener('blur', () => {
  for (const key of Object.keys(checkboxFields)) savedChecks[key] = null;
  savedLanguage = null;
  renderTexts();
});

shortcutsButton.addEventListener('click', async () => {
  // chrome:// は <a href> から開けないため、ここだけボタンで遷移させる
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

populate(settings);
renderTexts();

shortcut = await getAimModeShortcut();
renderTexts();
