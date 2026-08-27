/*
 * 照準モードのオーバーレイ（content script）
 *
 * chrome.scripting.executeScript で動的に注入される。静的な content_scripts は
 * 宣言していないため、この拡張はユーザーが照準モードを開いた瞬間のタブ以外に
 * 一切アクセスしない。
 *
 * 2回目以降の注入では、isolated world に残っているコントローラが
 * toggle として振る舞う（冒頭のガードを参照）。
 *
 * DOM の組み立てに innerHTML を使っていないのは意図的。
 * Trusted Types を強制しているページ（require-trusted-types-for 'script'）では
 * innerHTML への代入が例外になるため、DOM API のみで組み立てる。
 *
 * このファイルは ES モジュールとして読み込めないため（executeScript の files は
 * classic script）、設定は service worker からメッセージで受け取る。
 */

(() => {
  'use strict';

  const NS = '__screinkAimMode';
  if (window[NS]) {
    window[NS].toggle();
    return;
  }

  const MESSAGES = {
    GET_SETTINGS: 'screink:get-settings',
    CAPTURE_REGION: 'screink:capture-region',
    OPEN_CAPTURE_TAB: 'screink:open-capture-tab',
  };

  /** 矢印キー1回の移動量（CSSピクセル）。Shift 併用で微調整。 */
  const KEY_STEP = 8;
  const KEY_STEP_FINE = 1;

  const FALLBACK_SETTINGS = {
    regionWidth: 960,
    regionHeight: 320,
    showRegionOutline: true,
    openCaptureInTab: false,
  };

  let settings = { ...FALLBACK_SETTINGS };

  /** 'idle' | 'aiming' | 'busy' | 'result' */
  let state = 'idle';

  /** 照準位置。CSSピクセル・ビューポート基準。 */
  const pointer = { x: 0, y: 0 };

  let previouslyFocused = null;
  let ui = null;

  /* ---------------------------------------------------------------- *
   * DOM の組み立て
   * ---------------------------------------------------------------- */

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function keyCap(label) {
    const kbd = el('kbd', 'screink-key');
    kbd.textContent = label;
    return kbd;
  }

  function buildBar() {
    const bar = el('div', 'screink-bar');

    const name = el('span', 'screink-bar__name');
    name.textContent = 'screink 照準モード';
    bar.append(name);

    const hint = el('span', 'screink-bar__hint');
    hint.append(
      document.createTextNode('　クリック、または '),
      keyCap('←↑↓→'),
      document.createTextNode(' で位置を指定して '),
      keyCap('Enter'),
      document.createTextNode('　'),
      keyCap('Esc'),
      document.createTextNode(' で解除'),
    );
    bar.append(hint);

    return bar;
  }

  function buildPanel() {
    const panel = el('section', 'screink-panel');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'screink の切り出し結果');
    panel.hidden = true;

    const title = el('h2', 'screink-panel__title');
    const body = el('p', 'screink-panel__body');
    // 結果は読み上げにも届くようにする。自動では消さない。
    body.setAttribute('aria-live', 'polite');
    const note = el('p', 'screink-panel__note');
    const actions = el('div', 'screink-panel__actions');

    const openButton = el('button', 'screink-button');
    openButton.type = 'button';
    openButton.textContent = '切り出した画像を新しいタブで開く';

    const closeButton = el('button', 'screink-button');
    closeButton.type = 'button';
    closeButton.textContent = '閉じる';

    actions.append(openButton, closeButton);
    panel.append(title, body, note, actions);

    return { panel, title, body, note, openButton, closeButton };
  }

  function buildUi() {
    const root = el('div', 'screink-root');

    const catcher = el('div', 'screink-catcher');
    // キー入力を確実に受け取るためフォーカス可能にする。
    // フォーカスインジケーターはビューポートを囲む枠として CSS 側で描く。
    catcher.tabIndex = -1;
    catcher.setAttribute('role', 'application');
    catcher.setAttribute('aria-label', 'screink 照準モード：位置を指定してください');

    const crossV = el('div', 'screink-crosshair screink-crosshair--v');
    const crossH = el('div', 'screink-crosshair screink-crosshair--h');
    const region = el('div', 'screink-region');

    const bar = buildBar();
    const panelParts = buildPanel();

    root.append(catcher, region, crossV, crossH, bar, panelParts.panel);

    return { root, catcher, crossV, crossH, region, bar, ...panelParts };
  }

  /* ---------------------------------------------------------------- *
   * 座標計算
   * ---------------------------------------------------------------- */

  /**
   * 照準位置を中心とした切り出し領域を求める。
   * 単位はすべて CSS ピクセル・ビューポート基準。
   * 物理ピクセルへの変換は service worker 側で devicePixelRatio を使って行う。
   */
  function computeRegion() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const width = Math.min(settings.regionWidth, viewportWidth);
    const height = Math.min(settings.regionHeight, viewportHeight);

    let x = Math.round(pointer.x - width / 2);
    let y = Math.round(pointer.y - height / 2);
    x = Math.min(Math.max(x, 0), viewportWidth - width);
    y = Math.min(Math.max(y, 0), viewportHeight - height);

    return { x, y, width, height };
  }

  function setPointer(x, y) {
    pointer.x = Math.min(Math.max(x, 0), window.innerWidth - 1);
    pointer.y = Math.min(Math.max(y, 0), window.innerHeight - 1);
    renderGuides();
  }

  function renderGuides() {
    if (!ui) return;

    ui.crossV.style.left = `${pointer.x}px`;
    ui.crossH.style.top = `${pointer.y}px`;

    const region = computeRegion();
    ui.region.hidden = !settings.showRegionOutline;
    ui.region.style.left = `${region.x}px`;
    ui.region.style.top = `${region.y}px`;
    ui.region.style.width = `${region.width}px`;
    ui.region.style.height = `${region.height}px`;
  }

  /* ---------------------------------------------------------------- *
   * マウント
   * ---------------------------------------------------------------- */

  /**
   * オーバーレイの挿入先。
   * フルスクリーン表示中は fullscreen 要素の子孫でないと描画されないため、
   * 挿入先を切り替える。
   */
  function mountTarget() {
    return document.fullscreenElement ?? document.body ?? document.documentElement;
  }

  function mount() {
    mountTarget().append(ui.root);
  }

  function remount() {
    if (state === 'idle' || !ui) return;
    mount();
    renderGuides();
    if (state === 'aiming') ui.catcher.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- *
   * キャプチャ
   * ---------------------------------------------------------------- */

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function nextTask(delay = 0) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * オーバーレイを消した結果が、実際に合成済みのフレームへ反映されるまで待つ。
   *
   * requestAnimationFrame のコールバックは「そのフレームを描く直前」に走るため、
   * 2回待てば変更を含むフレームが描かれたことになる。ただし captureVisibleTab は
   * ブラウザプロセス側で合成済みのフレームを取るので、さらに1フレーム分の
   * 遅れが乗ることがある。実測（work/ の E2E スモークテスト）で写り込みが
   * 出たため、フレーム待ちとマクロタスク待ちを重ねて余裕をとっている。
   */
  async function waitForCleanFrame() {
    await nextFrame();
    await nextFrame();
    await nextTask(0);
    await nextFrame();
    await nextTask(24);
  }

  async function confirmPosition() {
    if (state !== 'aiming' || !ui) return;
    state = 'busy';

    const region = computeRegion();
    const dpr = window.devicePixelRatio || 1;

    // captureVisibleTab は自分のオーバーレイも一緒に写す。撮る前に隠す。
    ui.root.classList.add('screink-root--capturing');
    await waitForCleanFrame();

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.CAPTURE_REGION,
        region: { ...region, dpr },
      });
    } catch (error) {
      response = { ok: false, reason: 'messaging-failed', detail: String(error) };
    }

    ui.root.classList.remove('screink-root--capturing');
    showResult(region, dpr, response);
  }

  function showResult(region, dpr, response) {
    if (!ui) return;
    state = 'result';

    // 照準は畳む。ページのクリックは元どおり通るようになる。
    ui.catcher.hidden = true;
    ui.crossV.hidden = true;
    ui.crossH.hidden = true;
    ui.region.hidden = true;
    ui.bar.hidden = true;

    const succeeded = Boolean(response?.ok);

    if (succeeded) {
      const result = response.result;
      ui.title.textContent = '切り出しました';
      ui.body.textContent =
        `指定した位置を中心に ${region.width} × ${region.height} px（CSSピクセル）を切り出しました。`;

      const lines = [
        `CSS      : x=${result.css.x} y=${result.css.y} ${result.css.width}×${result.css.height}`,
        `物理px   : x=${result.device.x} y=${result.device.y} ${result.device.width}×${result.device.height}`,
        `DPR      : ${result.dpr}`,
        `画面画像 : ${result.viewportImage.width}×${result.viewportImage.height}`,
      ];
      if (result.clamped) lines.push('※ 画面端のため領域を画面内に収めました');
      ui.note.textContent = lines.join('\n');
      ui.note.style.whiteSpace = 'pre';

      ui.openButton.hidden = false;
      ui.openButton.textContent = response.openedInTab
        ? '切り出した画像をもう一度開く'
        : '切り出した画像を新しいタブで開く';
    } else {
      ui.title.textContent = '切り出せませんでした';
      ui.body.textContent = describeFailure(response);
      ui.note.textContent = response?.detail ? String(response.detail) : '';
      ui.note.style.whiteSpace = 'pre-wrap';
      ui.openButton.hidden = true;
    }

    ui.panel.hidden = false;
    const focusTarget = ui.openButton.hidden ? ui.closeButton : ui.openButton;
    focusTarget.focus({ preventScroll: true });
  }

  function describeFailure(response) {
    switch (response?.reason) {
      case 'no-active-tab':
        return 'アクティブなタブを特定できませんでした。';
      case 'capture-failed':
        return '画面を取得できませんでした。タブが表示されているか確認してください。';
      case 'messaging-failed':
        return '拡張の内部通信に失敗しました。拡張を再読み込みしてください。';
      default:
        return '原因を特定できませんでした。';
    }
  }

  async function openCaptureTab() {
    try {
      await chrome.runtime.sendMessage({ type: MESSAGES.OPEN_CAPTURE_TAB });
    } catch (error) {
      console.warn('[screink] 切り出し画像を開けませんでした:', error);
    }
  }

  /* ---------------------------------------------------------------- *
   * イベント
   * ---------------------------------------------------------------- */

  /**
   * ポインタ操作をページへ一切届けないための遮断。
   *
   * 透明な受け止めレイヤーだけでは足りない。ページが document や html に
   * capture フェーズのリスナーを付けている場合、イベントはそこを通過したあとに
   * こちらの要素へ届くため、ページ側のリスナーが先に発火してしまう。
   *
   * capture フェーズの順序は window → document → ... → target なので、
   * window に capture で登録すればページ側のどのリスナーよりも先に走れる。
   * ここで stopImmediatePropagation して止める。
   */
  const BLOCKED_POINTER_EVENTS = [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
    'auxclick',
    'dblclick',
    'contextmenu',
  ];

  function onPointerCapture(event) {
    if (state !== 'aiming') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // 左クリックの click で位置を確定する
    if (event.type === 'click' && event.button === 0) {
      setPointer(event.clientX, event.clientY);
      confirmPosition();
    }
  }

  function onPointerMoveCapture(event) {
    if (state !== 'aiming') return;
    // ページ側のホバー処理を起こさないよう、移動も止める
    event.stopImmediatePropagation();
    setPointer(event.clientX, event.clientY);
  }

  function onKeyDown(event) {
    if (state === 'idle') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      exit();
      return;
    }

    if (state !== 'aiming') return;

    const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP;
    let dx = 0;
    let dy = 0;

    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        confirmPosition();
        return;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    setPointer(pointer.x + dx, pointer.y + dy);
  }

  function onViewportChange() {
    if (state === 'aiming') setPointer(pointer.x, pointer.y);
  }

  const listeners = [];

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler, options });
  }

  function offAll() {
    while (listeners.length > 0) {
      const { target, type, handler, options } = listeners.pop();
      target.removeEventListener(type, handler, options);
    }
  }

  /* ---------------------------------------------------------------- *
   * 開始 / 終了
   * ---------------------------------------------------------------- */

  /**
   * 設定は非同期に取得して後から反映する。
   * UI の表示を設定の取得待ちにしないことで、二重起動の競合も避けられる。
   */
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MESSAGES.GET_SETTINGS });
      if (response?.ok) {
        settings = response.settings;
        if (state === 'aiming') renderGuides();
      }
    } catch {
      // 取得できなければ既定値のまま続行する
    }
  }

  function enter() {
    if (state !== 'idle') return;

    previouslyFocused = document.activeElement;
    ui = buildUi();
    state = 'aiming';
    mount();

    setPointer(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));

    for (const type of BLOCKED_POINTER_EVENTS) on(window, type, onPointerCapture, true);
    on(window, 'pointermove', onPointerMoveCapture, true);
    on(window, 'mousemove', onPointerMoveCapture, true);
    on(ui.openButton, 'click', openCaptureTab);
    on(ui.closeButton, 'click', exit);
    on(window, 'keydown', onKeyDown, true);
    on(window, 'resize', onViewportChange);
    on(document, 'fullscreenchange', remount);

    ui.catcher.focus({ preventScroll: true });

    loadSettings();
  }

  function exit() {
    if (state === 'idle') return;
    state = 'idle';
    offAll();
    ui?.root.remove();
    ui = null;

    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        // フォーカス復帰に失敗しても致命的ではない
      }
    }
    previouslyFocused = null;
  }

  function toggle() {
    if (state === 'idle') enter();
    else exit();
  }

  window[NS] = { toggle, enter, exit };
  enter();
})();
