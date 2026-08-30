/*
 * 照準モードのオーバーレイ（content script）
 *
 * chrome.scripting.executeScript で動的に注入される。静的な content_scripts は
 * 宣言していないため、この拡張はユーザーが照準モードを開いた瞬間のタブ以外に
 * 一切アクセスしない（仕様書 §4.2）。
 *
 * 2回目以降の注入では、isolated world に残っているコントローラが
 * toggle として振る舞う（冒頭のガードを参照）。
 *
 * DOM の組み立てに innerHTML を使っていないのは意図的。
 * Trusted Types を強制しているページ（require-trusted-types-for 'script'）では
 * innerHTML への代入が例外になるため、DOM API のみで組み立てる（仕様書 §4.4）。
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
    RECOGNIZE: 'screink:recognize',
    OPEN_URL: 'screink:open-url',
    OPEN_CAPTURE_TAB: 'screink:open-capture-tab',
  };

  /**
   * 表示文字列。
   * content script でも chrome.i18n は使えるので、拡張ページと同じ辞書を引く。
   */
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);

  /** 矢印キー1回の移動量（CSSピクセル）。Shift 併用で微調整。 */
  const KEY_STEP = 8;
  const KEY_STEP_FINE = 1;

  const FALLBACK_SETTINGS = {
    qrRegionSize: 560,
    openCaptureInTab: false,
  };

  let settings = { ...FALLBACK_SETTINGS };

  /** 'idle' | 'aiming' | 'busy' | 'result' */
  let state = 'idle';

  /** 照準位置。CSSピクセル・ビューポート基準。 */
  const pointer = { x: 0, y: 0 };

  let previouslyFocused = null;
  let ui = null;

  /** 直近の認識結果と、いま表示している候補の位置。 */
  let recognition = null;
  let candidateIndex = 0;

  /* ---------------------------------------------------------------- *
   * DOM の組み立て
   * ---------------------------------------------------------------- */

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function buildBar() {
    const bar = el('div', 'screink-bar');

    const name = el('span', 'screink-bar__name');
    name.textContent = t('overlayBarName');
    bar.append(name);

    // 案内文は1つの文にしている。文中にキー表示を差し込むと、
    // 言語ごとに語順が変わるため翻訳できる形にならない。
    const hint = el('span', 'screink-bar__hint');
    hint.textContent = `　${t('overlayBarHint')}`;
    bar.append(hint);

    return bar;
  }

  function buildPanel() {
    const panel = el('section', 'screink-panel');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', t('overlayPanelLabel'));
    panel.hidden = true;

    const title = el('h2', 'screink-panel__title');
    // 結果は読み上げにも届くようにする。自動では消さない。
    title.setAttribute('aria-live', 'polite');

    const body = el('p', 'screink-panel__body');

    const destination = el('p', 'screink-panel__destination');
    const destinationLabel = el('span', 'screink-panel__label');
    destinationLabel.textContent = t('overlayDestination');
    const destinationHost = el('span', 'screink-panel__host');
    destination.append(destinationLabel, destinationHost);

    const payload = el('p', 'screink-panel__payload');

    const note = el('p', 'screink-panel__note');

    const status = el('p', 'screink-panel__status');
    status.setAttribute('role', 'status');

    const actions = el('div', 'screink-panel__actions');

    const openButton = el('button', 'screink-button');
    openButton.type = 'button';
    openButton.textContent = t('overlayOpen');

    const copyButton = el('button', 'screink-button screink-button--secondary');
    copyButton.type = 'button';
    copyButton.textContent = t('overlayCopyText');

    const nextButton = el('button', 'screink-button screink-button--secondary');
    nextButton.type = 'button';
    nextButton.textContent = t('overlayNext');

    const retryButton = el('button', 'screink-button screink-button--secondary');
    retryButton.type = 'button';
    retryButton.textContent = t('overlayRetry');

    const debugButton = el('button', 'screink-button screink-button--secondary');
    debugButton.type = 'button';
    debugButton.textContent = t('overlayInspect');

    const closeButton = el('button', 'screink-button screink-button--secondary');
    closeButton.type = 'button';
    closeButton.textContent = t('overlayClose');

    actions.append(openButton, copyButton, nextButton, retryButton, debugButton, closeButton);
    panel.append(title, body, destination, payload, note, status, actions);

    return {
      panel,
      title,
      body,
      destination,
      destinationHost,
      payload,
      note,
      status,
      openButton,
      copyButton,
      nextButton,
      retryButton,
      debugButton,
      closeButton,
    };
  }

  function buildUi() {
    const root = el('div', 'screink-root');

    const catcher = el('div', 'screink-catcher');
    // キー入力を確実に受け取るためフォーカス可能にする。
    // フォーカスインジケーターはビューポートを囲む枠として CSS 側で描く。
    catcher.tabIndex = -1;
    catcher.setAttribute('role', 'application');
    catcher.setAttribute('aria-label', t('overlayCatcherLabel'));

    const crossV = el('div', 'screink-crosshair screink-crosshair--v');
    const crossH = el('div', 'screink-crosshair screink-crosshair--h');
    const found = el('div', 'screink-found');
    found.hidden = true;

    const bar = buildBar();
    const panelParts = buildPanel();

    root.append(catcher, found, crossV, crossH, bar, panelParts.panel);

    return { root, catcher, crossV, crossH, found, bar, ...panelParts };
  }

  /* ---------------------------------------------------------------- *
   * 座標計算
   * ---------------------------------------------------------------- */

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * 照準位置を中心とした正方形領域を求める。
   * QRコードは縦横比 1:1 なので正方形で切り出す（仕様書 §4.6）。
   * 単位はすべて CSS ピクセル・ビューポート基準。
   */
  function squareRegion(size) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const side = Math.min(size, viewportWidth, viewportHeight);

    return {
      x: clamp(Math.round(pointer.x - side / 2), 0, viewportWidth - side),
      y: clamp(Math.round(pointer.y - side / 2), 0, viewportHeight - side),
      width: side,
      height: side,
    };
  }

  function sameRegion(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }

  /** 探索を始める最小の一辺（CSSピクセル）。物理48pxが読める下限なので、その少し上から。 */
  const SMALLEST_REGION = 64;
  /** 段階ごとの拡大率。細かいほど隣のコードを切り離せるが、試行回数が増える。 */
  const REGION_GROWTH = 1.5;

  /**
   * 試す領域を、狭いものから順に並べる。
   *
   * 狭い方から始めるのには2つの理由がある。
   *
   * 1. jsQR は画像内にQRコードが複数あると1つも返さない（実測。work/e2e）。
   *    広い範囲をいきなり走査すると、隣のQRコードを巻き込んで全滅する。
   * 2. 「指した場所にあるQRコード」を選ぶという意味論に素直に一致する。
   *    最初に当たるのは、指した位置にいちばん近いコードになる。
   *
   * 逆に、画面に大きく表示されたQRコードは狭い枠に収まらないため、
   * 見つからなければ順に広げ、最後は画面全体まで試す。
   *
   * 段階を細かくしているのは実測に基づく。段階が粗いと、近接した小さな
   * QRコード（一辺80px・間隔5〜10px）が、どの段階でも隣を巻き込んで
   * 読めなくなる。最小の段階を小さく、刻みを細かくすることで、
   * 指したコードだけが写る段階が現れるようにしている。
   *
   * 狭く切り出すと余白（クワイエットゾーン）が無くなるが、それは
   * service worker 側で白い縁を足して補う。
   */
  function regionsToTry() {
    const base = settings.qrRegionSize;
    const viewportMax = Math.max(window.innerWidth, window.innerHeight);

    const sizes = [];
    for (let size = SMALLEST_REGION; size < base * 2; size = Math.round(size * REGION_GROWTH)) {
      sizes.push(size);
    }
    sizes.push(base, base * 2, viewportMax);

    const regions = [];
    for (const size of [...new Set(sizes)].sort((a, b) => a - b)) {
      const region = squareRegion(size);
      if (!regions.some((existing) => sameRegion(existing, region))) regions.push(region);
    }
    return regions;
  }

  function setPointer(x, y) {
    pointer.x = clamp(x, 0, window.innerWidth - 1);
    pointer.y = clamp(y, 0, window.innerHeight - 1);
    renderGuides();
  }

  /*
   * 照準は十字だけにしている。
   *
   * 以前は「探す範囲」を四角い枠で示していたが、読み取りが
   * 「指した位置にある対象の輪郭を読む」方式に変わったことで、
   * 枠は実態と合わなくなった（枠の外でも、その上を指せば読める。
   * 枠の中でも、指していなければ読まない）。
   * 誤解を招く情報なので出さない。仕様書 §4.6 を参照。
   */
  function renderGuides() {
    if (!ui) return;
    ui.crossV.style.left = `${pointer.x}px`;
    ui.crossH.style.top = `${pointer.y}px`;
  }

  /**
   * 結果パネルを、読み取った対象と反対側へ置く。
   * 見つけたものをパネル自身が隠してしまうと、確認のしようがない。
   */
  function placePanel(bboxCss) {
    if (!ui) return;
    const inLowerHalf = bboxCss
      ? bboxCss.y + bboxCss.height / 2 > window.innerHeight / 2
      : false;
    ui.panel.classList.toggle('screink-panel--top', inLowerHalf);
  }

  /** 見つかったQRコードの位置を画面上に示す。 */
  function renderFoundBox(bboxCss) {
    if (!ui) return;
    placePanel(bboxCss);
    if (!bboxCss) {
      ui.found.hidden = true;
      return;
    }
    ui.found.style.left = `${bboxCss.x}px`;
    ui.found.style.top = `${bboxCss.y}px`;
    ui.found.style.width = `${bboxCss.width}px`;
    ui.found.style.height = `${bboxCss.height}px`;
    ui.found.hidden = false;
  }

  /* ---------------------------------------------------------------- *
   * マウント
   * ---------------------------------------------------------------- */

  /**
   * オーバーレイの挿入先。
   * フルスクリーン表示中は fullscreen 要素の子孫でないと描画されないため、
   * 挿入先を切り替える（仕様書 §4.3）。
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
   * キャプチャと認識
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
   * 遅れが乗ることがある。実測（work/e2e）で写り込みが出たため、
   * フレーム待ちとマクロタスク待ちを重ねて余裕をとっている（仕様書 §4.3）。
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

    const point = { x: pointer.x, y: pointer.y };
    const regions = regionsToTry();
    const dpr = window.devicePixelRatio || 1;

    // captureVisibleTab は自分のオーバーレイも一緒に写す。撮る前に隠す。
    ui.root.classList.add('screink-root--capturing');
    await waitForCleanFrame();

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.RECOGNIZE,
        point,
        regions,
        dpr,
      });
    } catch (error) {
      response = { ok: false, reason: 'messaging-failed', detail: String(error) };
    }

    ui.root.classList.remove('screink-root--capturing');
    showResult(response);
  }

  /* ---------------------------------------------------------------- *
   * 結果の表示
   * ---------------------------------------------------------------- */

  function collapseAiming() {
    // 照準は畳む。ページのクリックは元どおり通るようになる。
    ui.catcher.hidden = true;
    ui.crossV.hidden = true;
    ui.crossH.hidden = true;
    ui.bar.hidden = true;
  }

  function expandAiming() {
    ui.panel.hidden = true;
    ui.found.hidden = true;
    ui.catcher.hidden = false;
    ui.crossV.hidden = false;
    ui.crossH.hidden = false;
    ui.bar.hidden = false;
    state = 'aiming';
    renderGuides();
    ui.catcher.focus({ preventScroll: true });
  }

  function showResult(response) {
    if (!ui) return;
    state = 'result';
    collapseAiming();

    ui.status.textContent = '';

    if (!response?.ok) {
      recognition = null;
      showFailure(describeFailure(response), response?.detail ?? '');
      return;
    }

    recognition = response;
    candidateIndex = response.chosenIndex >= 0 ? response.chosenIndex : 0;

    if (!Array.isArray(response.candidates) || response.candidates.length === 0) {
      showNotFound(response);
      return;
    }

    showCandidate();
  }

  function showCandidate() {
    const candidates = recognition.candidates;
    const candidate = candidates[candidateIndex];

    renderFoundBox(candidate.bboxCss);

    const isUrl = candidate.kind === 'url';
    ui.title.textContent = t(isUrl ? 'overlayTitleUrl' : 'overlayTitleText');

    const parts = [];
    if (candidates.length > 1) {
      parts.push(
        t('overlayCandidateCount', [String(candidateIndex + 1), String(candidates.length)]),
      );
    }
    if (!candidate.containsPoint) {
      parts.push(t('overlayFarFromPoint'));
    }
    ui.body.textContent = parts.join(' / ');
    ui.body.hidden = parts.length === 0;

    if (isUrl) {
      ui.destination.hidden = false;
      ui.destinationHost.textContent = hostnameOf(candidate.url);
      ui.payload.textContent = candidate.url;
    } else {
      ui.destination.hidden = true;
      ui.payload.textContent = candidate.text;
    }
    ui.payload.hidden = false;

    ui.note.textContent = `${recognition.engine} / ${recognition.elapsedMs} ms`;
    ui.note.hidden = false;

    ui.openButton.hidden = !isUrl;
    ui.copyButton.hidden = false;
    ui.copyButton.textContent = t(isUrl ? 'overlayCopyUrl' : 'overlayCopyText');
    ui.nextButton.hidden = candidates.length <= 1;
    ui.retryButton.hidden = false;
    ui.debugButton.hidden = false;

    ui.panel.hidden = false;
    (isUrl ? ui.openButton : ui.copyButton).focus({ preventScroll: true });
  }

  function showNotFound(response) {
    renderFoundBox(null);
    ui.title.textContent = t('overlayTitleNotFound');
    ui.body.textContent = t('overlayBodyNotFound');
    ui.body.hidden = false;
    ui.destination.hidden = true;
    ui.payload.hidden = true;
    ui.note.textContent = `${response.engine} / ${response.elapsedMs} ms`;
    ui.note.hidden = false;

    ui.openButton.hidden = true;
    ui.copyButton.hidden = true;
    ui.nextButton.hidden = true;
    ui.retryButton.hidden = false;
    ui.debugButton.hidden = false;

    ui.panel.hidden = false;
    ui.retryButton.focus({ preventScroll: true });
  }

  function showFailure(message, detail) {
    renderFoundBox(null);
    ui.title.textContent = t('overlayTitleFailed');
    ui.body.textContent = message;
    ui.body.hidden = false;
    ui.destination.hidden = true;
    ui.payload.hidden = true;
    ui.note.textContent = detail;
    ui.note.hidden = detail === '';

    ui.openButton.hidden = true;
    ui.copyButton.hidden = true;
    ui.nextButton.hidden = true;
    ui.retryButton.hidden = false;
    ui.debugButton.hidden = true;

    ui.panel.hidden = false;
    ui.retryButton.focus({ preventScroll: true });
  }

  function describeFailure(response) {
    switch (response?.reason) {
      case 'no-active-tab':
        return t('errorNoTab');
      case 'capture-failed':
        return t('overlayFailCapture');
      case 'messaging-failed':
        return t('overlayFailMessaging');
      default:
        return t('overlayFailUnknown');
    }
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /* ---------------------------------------------------------------- *
   * パネルの操作
   * ---------------------------------------------------------------- */

  async function openCandidate() {
    const candidate = recognition?.candidates?.[candidateIndex];
    if (!candidate?.url) return;

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.OPEN_URL,
        url: candidate.url,
      });
    } catch (error) {
      response = { ok: false, reason: 'messaging-failed', detail: String(error) };
    }

    if (response?.ok) {
      exit();
      return;
    }
    ui.status.textContent =
      response?.reason === 'unsafe-url'
        ? t('overlayUnsafeUrl')
        : t('overlayOpenFailed');
  }

  async function copyCandidate() {
    const candidate = recognition?.candidates?.[candidateIndex];
    if (!candidate) return;
    const text = candidate.url ?? candidate.text;

    try {
      await navigator.clipboard.writeText(text);
      ui.status.textContent = t('overlayCopied');
    } catch {
      // ページの権限ポリシーでクリップボードが使えないことがある。
      // その場合は手で選択してもらう（テキストは選択可能にしてある）。
      ui.status.textContent = t('overlayCopyFailed');
    }
  }

  function showNextCandidate() {
    if (!recognition?.candidates?.length) return;
    candidateIndex = (candidateIndex + 1) % recognition.candidates.length;
    ui.status.textContent = '';
    showCandidate();
  }

  async function openCaptureTab() {
    try {
      await chrome.runtime.sendMessage({ type: MESSAGES.OPEN_CAPTURE_TAB });
    } catch (error) {
      ui.status.textContent = t('overlayInspectFailed');
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
   * ここで stopImmediatePropagation して止める（仕様書 §3.2）。
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
    on(ui.openButton, 'click', openCandidate);
    on(ui.copyButton, 'click', copyCandidate);
    on(ui.nextButton, 'click', showNextCandidate);
    on(ui.retryButton, 'click', expandAiming);
    on(ui.debugButton, 'click', openCaptureTab);
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
    recognition = null;
    candidateIndex = 0;

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
