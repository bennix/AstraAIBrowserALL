(() => {
  const supportedDomains = ['twitter.com', 'x.com'];
  const hostname = location.hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
  const isSupportedHost = supportedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
  if (!isSupportedHost || window.__astraXImageZoomInstalled) return;
  window.__astraXImageZoomInstalled = true;

  const minimumScale = 1;
  const maximumScale = 8;
  const state = {
    image: null,
    source: '',
    scale: minimumScale,
    translationX: 0,
    translationY: 0,
    baseRect: null,
    savedStyles: null,
    draggableAttribute: null,
    gestureStartScale: minimumScale,
    gestureActive: false,
    pointerId: null,
    pointerX: 0,
    pointerY: 0,
    pointerMoved: false,
    suppressClick: false,
    stageRoot: null,
    stage: null
  };

  const sourceFor = (image) => image?.currentSrc || image?.src || '';
  const styleNames = [
    'cursor',
    'opacity',
    'pointer-events',
    'transform',
    'transform-origin',
    'transition',
    'user-select',
    'will-change'
  ];
  const saveStyles = (image) => Object.fromEntries(styleNames.map((name) => [
    name,
    {
      value: image.style.getPropertyValue(name),
      priority: image.style.getPropertyPriority(name)
    }
  ]));
  const restoreStyles = (image, styles) => {
    if (!image || !styles) return;
    for (const name of styleNames) {
      const saved = styles[name];
      if (saved?.value) image.style.setProperty(name, saved.value, saved.priority);
      else image.style.removeProperty(name);
    }
  };
  const isMediaElement = (media) => media instanceof HTMLImageElement;
  const viewerSelector = '[role="dialog"], [data-testid="swipe-to-dismiss"]';
  const isPhotoRoute = () => /\/status\/\d+\/photo\/\d+(?:\/|$)/.test(location.pathname);
  const isViewerMedia = (media) => {
    if (!isMediaElement(media) || media === state.stage) return false;
    const rect = media.getBoundingClientRect();
    const style = getComputedStyle(media);
    if (rect.width < 120 || rect.height < 120 || style.display === 'none' || style.visibility === 'hidden') return false;
    let source;
    try { source = new URL(sourceFor(media)); } catch { return false; }
    return source.hostname === 'pbs.twimg.com' && source.pathname.startsWith('/media/')
      && Boolean(media.closest(viewerSelector) || (isPhotoRoute() && media.closest('[data-testid="photo"]')));
  };
  const currentViewerMedia = () => {
    let selected = null;
    let selectedScore = 0;
    const viewportWidth = Math.max(
      Number(document.documentElement?.clientWidth) || 0,
      Number(window.innerWidth) || 0
    );
    const viewportHeight = Math.max(
      Number(document.documentElement?.clientHeight) || 0,
      Number(window.innerHeight) || 0
    );
    document.querySelectorAll(
      '[role="dialog"] img, [data-testid="swipe-to-dismiss"] img, [data-testid="photo"] img'
    ).forEach((media) => {
      if (!isViewerMedia(media)) return;
      const rect = media.getBoundingClientRect();
      const rectRight = Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
      const rectBottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
      const visibleWidth = Math.max(
        0,
        Math.min(rectRight, viewportWidth) - Math.max(rect.left, 0)
      );
      const visibleHeight = Math.max(
        0,
        Math.min(rectBottom, viewportHeight) - Math.max(rect.top, 0)
      );
      const visibleArea = visibleWidth * visibleHeight;
      if (visibleArea <= 0) return;
      const totalArea = Math.max(1, rect.width * rect.height);
      const visibleRatio = visibleArea / totalArea;
      const mediaWeight = sourceFor(media).includes('pbs.twimg.com/media/') ? 2 : 1;
      let hitWeight = 1;
      if (typeof document.elementsFromPoint === 'function') {
        const sampleX = Math.max(0, Math.min(viewportWidth - 1, rect.left + rect.width / 2));
        const sampleY = Math.max(0, Math.min(viewportHeight - 1, rect.top + rect.height / 2));
        const hitStack = document.elementsFromPoint(sampleX, sampleY);
        const hitMedia = hitStack.find(isMediaElement);
        const topMedia = hitMedia === state.stage ? state.image : hitMedia;
        hitWeight = topMedia === media ? 8 : (hitStack.includes(media) ? 0.5 : 0.25);
      }
      const score = visibleArea * (1 + visibleRatio) * mediaWeight * hitWeight;
      if (score > selectedScore) {
        selected = media;
        selectedScore = score;
      }
    });
    return selected;
  };

  const destroyStage = () => {
    if (state.stageRoot?.parentNode) state.stageRoot.parentNode.removeChild(state.stageRoot);
    state.stageRoot = null;
    state.stage = null;
  };
  const applyStageStyles = (element, styles) => {
    Object.entries(styles).forEach(([name, value]) => {
      element.style.setProperty(
        name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        value,
        'important'
      );
    });
  };
  const ensureStage = (image) => {
    const isImage = typeof HTMLImageElement !== 'undefined'
      && image instanceof HTMLImageElement;
    if (!isImage || !state.baseRect) return null;
    if (state.stage && state.stageRoot?.parentNode) {
      if (state.stage.src !== sourceFor(image)) state.stage.src = sourceFor(image);
      return state.stage;
    }
    destroyStage();
    const root = document.createElement('div');
    root.id = '__astra-x-image-zoom-stage';
    applyStageStyles(root, {
      position: 'fixed',
      left: '0',
      top: '0',
      right: '0',
      bottom: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483646'
    });
    const stage = document.createElement('img');
    stage.alt = image.alt || '';
    stage.src = sourceFor(image);
    stage.draggable = false;
    applyStageStyles(stage, {
      position: 'absolute',
      left: `${state.baseRect.left}px`,
      top: `${state.baseRect.top}px`,
      width: `${state.baseRect.width}px`,
      height: `${state.baseRect.height}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0',
      padding: '0',
      border: 'none',
      objectFit: 'contain',
      transformOrigin: 'center center',
      pointerEvents: 'auto',
      userSelect: 'none',
      willChange: 'transform'
    });
    root.appendChild(stage);
    document.body.appendChild(root);
    image.style.setProperty('opacity', '0', 'important');
    image.style.setProperty('pointer-events', 'none', 'important');
    state.stageRoot = root;
    state.stage = stage;
    return stage;
  };
  const isZoomVisual = (target) => target === state.image || target === state.stage;
  const reset = () => {
    const image = state.image;
    destroyStage();
    if (image) {
      restoreStyles(image, state.savedStyles);
      if (state.draggableAttribute === null) image.removeAttribute('draggable');
      else image.setAttribute('draggable', state.draggableAttribute);
    }
    state.image = null;
    state.source = '';
    state.scale = minimumScale;
    state.translationX = 0;
    state.translationY = 0;
    state.baseRect = null;
    state.savedStyles = null;
    state.draggableAttribute = null;
    state.gestureStartScale = minimumScale;
    state.gestureActive = false;
    state.pointerId = null;
    state.pointerMoved = false;
    updateControlState();
  };
  const activate = (image) => {
    if (!isViewerMedia(image)) return false;
    const source = sourceFor(image);
    if (state.image === image && state.source === source) return true;
    reset();
    state.image = image;
    state.source = source;
    state.baseRect = image.getBoundingClientRect();
    state.savedStyles = saveStyles(image);
    state.draggableAttribute = image.getAttribute('draggable');
    image.setAttribute('draggable', 'false');
    image.style.setProperty('transform-origin', 'center center', 'important');
    image.style.setProperty('user-select', 'none', 'important');
    image.style.setProperty('will-change', 'transform', 'important');
    return true;
  };
  const clampTranslation = () => {
    const image = state.image;
    const baseRect = state.baseRect;
    if (!image || !baseRect) return;
    const viewer = image.closest('[role="dialog"], [data-testid="swipe-to-dismiss"]');
    const viewport = viewer?.getBoundingClientRect() || {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const maximumX = Math.max(0, (baseRect.width * state.scale - viewport.width) / 2);
    const maximumY = Math.max(0, (baseRect.height * state.scale - viewport.height) / 2);
    state.translationX = Math.max(-maximumX, Math.min(maximumX, state.translationX));
    state.translationY = Math.max(-maximumY, Math.min(maximumY, state.translationY));
  };
  const render = (animated = false) => {
    const image = state.image;
    if (!image) return;
    clampTranslation();
    const stage = ensureStage(image);
    const target = stage || image;
    target.style.setProperty(
      'transition',
      animated ? 'transform 160ms ease-out' : 'none',
      'important'
    );
    target.style.setProperty(
      'transform',
      `translate3d(${state.translationX}px, ${state.translationY}px, 0) scale(${state.scale})`,
      'important'
    );
    target.style.setProperty('cursor', state.scale > minimumScale ? 'grab' : 'zoom-in', 'important');
    updateControlState(image);
  };
  const zoomTo = (image, requestedScale, clientX, clientY, animated = false) => {
    if (!activate(image)) return;
    const previousScale = state.scale;
    const nextScale = Math.max(minimumScale, Math.min(maximumScale, requestedScale));
    if (nextScale <= minimumScale + 0.001) {
      reset();
      return;
    }
    const baseRect = state.baseRect;
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;
    const anchorX = Number.isFinite(clientX) ? clientX : centerX;
    const anchorY = Number.isFinite(clientY) ? clientY : centerY;
    const ratio = nextScale / previousScale;
    state.translationX = anchorX - centerX
      - (anchorX - centerX - state.translationX) * ratio;
    state.translationY = anchorY - centerY
      - (anchorY - centerY - state.translationY) * ratio;
    state.scale = nextScale;
    render(animated);
  };

  const controls = (() => {
    if (!document.body || typeof document.createElement !== 'function') return null;
    const isChinese = (document.documentElement.lang || '').toLowerCase().startsWith('zh');
    const host = document.createElement('div');
    host.id = '__astra-x-image-zoom-controls';
    host.setAttribute('role', 'toolbar');
    host.setAttribute('aria-label', isChinese ? '图片缩放控制' : 'Image zoom controls');
    const hostStyles = {
      position: 'fixed',
      left: '50%',
      bottom: '72px',
      transform: 'translateX(-50%)',
      display: 'none',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: '999px',
      background: 'rgba(15, 20, 25, 0.92)',
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.42)',
      backdropFilter: 'blur(16px)',
      color: '#ffffff',
      font: '600 13px -apple-system, BlinkMacSystemFont, sans-serif',
      pointerEvents: 'auto',
      userSelect: 'none',
      zIndex: '2147483647'
    };
    Object.entries(hostStyles).forEach(([name, value]) => {
      host.style.setProperty(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, 'important');
    });

    const makeButton = (text, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.title = label;
      button.setAttribute('aria-label', label);
      const styles = {
        width: '32px',
        height: '32px',
        padding: '0',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.10)',
        color: '#ffffff',
        font: '700 18px -apple-system, BlinkMacSystemFont, sans-serif',
        lineHeight: '30px',
        cursor: 'pointer',
        appearance: 'none'
      };
      Object.entries(styles).forEach(([name, value]) => {
        button.style.setProperty(
          name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
          value,
          'important'
        );
      });
      return button;
    };

    const zoomOut = makeButton('−', isChinese ? '缩小图片' : 'Zoom out');
    const zoomIn = makeButton('+', isChinese ? '放大图片' : 'Zoom in');
    const resetButton = makeButton('↺', isChinese ? '重置为 100%' : 'Reset to 100%');
    resetButton.style.setProperty('font-size', '16px', 'important');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(minimumScale);
    slider.max = String(maximumScale);
    slider.step = '0.05';
    slider.value = String(minimumScale);
    slider.title = isChinese ? '缩放比例' : 'Zoom level';
    slider.setAttribute('aria-label', slider.title);
    slider.style.setProperty('width', 'clamp(96px, 18vw, 180px)', 'important');
    slider.style.setProperty('height', '24px', 'important');
    slider.style.setProperty('margin', '0', 'important');
    slider.style.setProperty('accent-color', '#1d9bf0', 'important');
    slider.style.setProperty('cursor', 'pointer', 'important');

    const value = document.createElement('span');
    value.textContent = '100%';
    value.style.setProperty('display', 'inline-block', 'important');
    value.style.setProperty('width', '46px', 'important');
    value.style.setProperty('text-align', 'center', 'important');
    value.style.setProperty('font-variant-numeric', 'tabular-nums', 'important');

    host.append(zoomOut, slider, zoomIn, value, resetButton);
    const stopPropagation = (event) => event.stopPropagation();
    ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel'].forEach((name) => {
      host.addEventListener(name, stopPropagation, { passive: false });
    });
    document.body.appendChild(host);
    return { host, zoomOut, slider, zoomIn, value, resetButton };
  })();

  const updateControlState = (preferredImage) => {
    if (!controls) return;
    const image = preferredImage || currentViewerMedia();
    controls.host.style.setProperty('display', image ? 'flex' : 'none', 'important');
    if (!image) return;
    const scale = state.image === image ? state.scale : minimumScale;
    controls.slider.value = String(scale);
    controls.value.textContent = `${Math.round(scale * 100)}%`;
    controls.zoomOut.disabled = scale <= minimumScale + 0.001;
    controls.zoomIn.disabled = scale >= maximumScale - 0.001;
    controls.zoomOut.style.setProperty(
      'opacity', controls.zoomOut.disabled ? '0.42' : '1', 'important'
    );
    controls.zoomIn.style.setProperty(
      'opacity', controls.zoomIn.disabled ? '0.42' : '1', 'important'
    );
  };
  const controlScaleTo = (requestedScale, animated = false) => {
    const image = currentViewerMedia();
    if (!image || !Number.isFinite(requestedScale)) return;
    zoomTo(image, requestedScale, undefined, undefined, animated);
    updateControlState(image);
  };
  if (controls) {
    controls.zoomOut.addEventListener('click', (event) => {
      event.preventDefault();
      const image = currentViewerMedia();
      const scale = state.image === image ? state.scale : minimumScale;
      controlScaleTo(scale / 1.25, true);
    });
    controls.zoomIn.addEventListener('click', (event) => {
      event.preventDefault();
      const image = currentViewerMedia();
      const scale = state.image === image ? state.scale : minimumScale;
      controlScaleTo(scale * 1.25, true);
    });
    controls.slider.addEventListener('input', () => {
      controlScaleTo(Number(controls.slider.value));
    });
    controls.resetButton.addEventListener('click', (event) => {
      event.preventDefault();
      reset();
    });
  }

  window.__astraXImageZoom = Object.freeze({
    magnify(rawMagnification) {
      const image = currentViewerMedia();
      const magnification = Number(rawMagnification);
      if (!image || !Number.isFinite(magnification) || magnification === 0) return false;
      const currentScale = state.image === image ? state.scale : minimumScale;
      zoomTo(image, currentScale * Math.exp(magnification));
      return true;
    },
    reset
  });

  document.addEventListener('gesturestart', (event) => {
    const image = currentViewerMedia();
    if (!image || !activate(image)) return;
    event.preventDefault();
    event.stopPropagation();
    state.gestureActive = true;
    state.gestureStartScale = state.scale;
  }, { capture: true, passive: false });
  document.addEventListener('gesturechange', (event) => {
    const image = currentViewerMedia();
    if (!image || !state.gestureActive) return;
    event.preventDefault();
    event.stopPropagation();
    zoomTo(
      image,
      state.gestureStartScale * Math.max(0.01, Number(event.scale) || 1),
      event.clientX,
      event.clientY
    );
  }, { capture: true, passive: false });
  document.addEventListener('gestureend', (event) => {
    if (!state.gestureActive) return;
    event.preventDefault();
    event.stopPropagation();
    state.gestureActive = false;
  }, { capture: true, passive: false });
  document.addEventListener('wheel', (event) => {
    if (controls?.host.contains(event.target)) return;
    const image = currentViewerMedia();
    if (!image || state.gestureActive || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 18 : (event.deltaMode === 2 ? window.innerHeight : 1);
    const factor = Math.exp(-event.deltaY * unit * 0.002);
    const currentScale = state.image === image ? state.scale : minimumScale;
    zoomTo(image, currentScale * factor, event.clientX, event.clientY);
  }, { capture: true, passive: false });
  document.addEventListener('dblclick', (event) => {
    const image = currentViewerMedia();
    if (!image) return;
    if (event.target !== image && event.target !== state.stage) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.image === image && state.scale > minimumScale + 0.001) reset();
    else zoomTo(image, 2, event.clientX, event.clientY, true);
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || state.scale <= minimumScale || !isZoomVisual(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    state.pointerId = event.pointerId;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.pointerMoved = false;
    (state.stage || state.image)?.setPointerCapture?.(event.pointerId);
    (state.stage || state.image)?.style.setProperty('cursor', 'grabbing', 'important');
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (state.pointerId !== event.pointerId || !state.image) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - state.pointerX;
    const deltaY = event.clientY - state.pointerY;
    state.pointerMoved = state.pointerMoved || Math.abs(deltaX) + Math.abs(deltaY) > 2;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.translationX += deltaX;
    state.translationY += deltaY;
    render();
  }, true);
  const endPointer = (event) => {
    if (state.pointerId !== event.pointerId) return;
    state.suppressClick = state.pointerMoved;
    state.pointerId = null;
    state.pointerMoved = false;
    if (state.image || state.stage) {
      (state.stage || state.image).style.setProperty('cursor', 'grab', 'important');
    }
    window.setTimeout(() => { state.suppressClick = false; }, 0);
  };
  document.addEventListener('pointerup', endPointer, true);
  document.addEventListener('pointercancel', endPointer, true);
  document.addEventListener('lostpointercapture', endPointer, true);
  document.addEventListener('click', (event) => {
    if (!state.suppressClick || !isZoomVisual(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') reset();
  }, true);
  window.addEventListener('resize', reset);

  let refreshScheduled = false;
  const refresh = () => {
    refreshScheduled = false;
    const image = currentViewerMedia();
    if (state.image && image === state.image) {
      const nextSource = sourceFor(image);
      if (nextSource !== state.source) {
        state.source = nextSource;
        if (state.stage) state.stage.src = nextSource;
      }
      if (state.scale > minimumScale + 0.001) render();
    } else if (state.image && (image !== state.image || sourceFor(image) !== state.source)) {
      reset();
    }
    updateControlState(image);
  };
  new MutationObserver(() => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    window.requestAnimationFrame(refresh);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
  updateControlState();
})();
