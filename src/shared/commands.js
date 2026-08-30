/**
 * ショートカットキーの実際の割り当てを取る。
 *
 * `manifest.json` の `suggested_key` は「希望」であって、確定した割り当てではない。
 * 他の拡張と衝突していれば割り当てられないし、ユーザーが変更することもある。
 * 画面に出す文字列は、必ずここから取った実際の値を使う。
 */

export const AIM_MODE_COMMAND = 'start-aim-mode';

/**
 * 照準モードの開始に、いま割り当てられているキー。
 * 割り当てが無ければ空文字を返す。
 *
 * このキーは開始しかしない。解除は Esc に一本化している。
 *
 * 返る形式は Chrome のショートカット設定と同じ（例：`Alt+Shift+S`）。
 * 表示のために整形しない。設定画面と見た目が食い違うほうが分かりにくい。
 */
export async function getAimModeShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    return commands.find((command) => command.name === AIM_MODE_COMMAND)?.shortcut ?? '';
  } catch {
    return '';
  }
}
