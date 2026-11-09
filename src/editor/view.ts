import type { PublicArtwork, PublicPhoto, PublicPreparedVersion } from '../shared/public-catalog.js';
import type { FrameResponse, RuntimeRegion } from '../shared/editor-protocol.js';
import { clampViewport, clientPointToImage, createFitViewport, panViewport, relativeZoom, resizeViewport, zoomViewportAt, type Viewport } from '../shared/coordinates.js';
import { assetUrl } from '../config.js';
import { ColoringWorkerClient } from './worker-client.js';
import { editorReducer, immutableFillSnapshot, initialEditorState, PALETTE, type EditorState, type HexColor } from './reducer.js';
import { coloringStore, openSaveSession, snapshotState } from './storage.js';

interface EditorOptions {
  artwork: PublicArtwork;
  prepared: PublicPreparedVersion;
  photo?: PublicPhoto;
  signal: AbortSignal;
}

type GestureMode = 'idle' | 'pendingTap' | 'pan' | 'pinch';
interface PointerState { startX: number; startY: number; x: number; y: number; lastX: number; lastY: number }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function colorName(value: string): string {
  return PALETTE.find(color => color.value === value)?.name ?? value;
}

function canvasFrame(canvas: HTMLCanvasElement, frame: FrameResponse): ImageData {
  canvas.width = frame.pixelWidth;
  canvas.height = frame.pixelHeight;
  return new ImageData(new Uint8ClampedArray(frame.rgba), frame.pixelWidth, frame.pixelHeight);
}

export function mountColoringEditor(host: HTMLElement, options: EditorOptions): () => void {
  const { artwork, prepared, photo, signal } = options;
  let disposed = false;
  let ready = false;
  let state: EditorState = initialEditorState();
  let viewport: Viewport | null = null;
  let hitLabels: Uint32Array | null = null;
  let regions: RuntimeRegion[] = [];
  let selectedIndex = 0;
  let lastFrame: ImageData | null = null;
  let referenceVisible = false;
  let selectionVisible = false;
  let exportUrl: string | undefined;
  let exportBusy = false;
  const namespace = `fcc-kalamazoo-stained-glass:${new URL(import.meta.env.BASE_URL, document.baseURI).pathname}`;
  const saves = openSaveSession({ namespace, artworkId: artwork.id, contentVersion: prepared.contentVersion }, prepared.regionCount);
  let client: ColoringWorkerClient | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let gesture: GestureMode = 'idle';
  const pointers = new Map<number, PointerState>();
  let pinchDistance = 0;
  let pinchMidpoint = { x: 0, y: 0 };

  const keyboardHint = el('p', 'Use arrow keys to choose a space. Press Enter to color it.', 'keyboard-hint');
  const stage = el('div', undefined, 'editor-stage');
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', `${artwork.title} coloring picture`);
  const canvas = el('canvas', undefined, 'editor-canvas');
  const fallback = el('img', undefined, 'editor-fallback');
  fallback.src = assetUrl(prepared.canonical.path);
  fallback.alt = artwork.title;
  fallback.width = prepared.width;
  fallback.height = prepared.height;
  const reference = el('img', undefined, 'editor-reference');
  reference.alt = photo?.alt ?? 'Original stained glass photograph';
  reference.hidden = true;
  stage.append(canvas, fallback, reference);

  const status = el('p', 'Preparing coloring tool…', 'editor-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const palette = el('div', undefined, 'palette');
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Colors');
  const paletteButtons = new Map<HexColor, HTMLButtonElement>();
  for (const color of PALETTE) {
    const button = el('button', undefined, 'color-button');
    button.type = 'button';
    button.dataset.color = color.value;
    button.setAttribute('aria-label', color.name);
    button.title = color.name;
    button.setAttribute('aria-pressed', color.value === state.selectedColor ? 'true' : 'false');
    const swatch = el('span', undefined, 'color-swatch');
    swatch.style.backgroundColor = color.value;
    swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch);
    button.addEventListener('click', () => {
      state = editorReducer(state, { type: 'select-color', color: color.value });
      updateControls();
      announceSelection();
      persist();
    });
    palette.append(button);
    paletteButtons.set(color.value, button);
  }

  const historyActions = el('div', undefined, 'editor-actions');
  const undo = el('button', '↶', 'action history-button'); undo.type = 'button'; undo.setAttribute('aria-label', 'Undo'); undo.title = 'Undo';
  const redo = el('button', '↷', 'action history-button'); redo.type = 'button'; redo.setAttribute('aria-label', 'Redo'); redo.title = 'Redo';
  const reset = el('button', 'Clear', 'action clear-button'); reset.type = 'button';
  historyActions.append(undo, redo);

  const viewActions = el('div', undefined, 'editor-actions');
  const zoomOut = el('button', 'Zoom out', 'action'); zoomOut.type = 'button';
  const zoomIn = el('button', 'Zoom in', 'action'); zoomIn.type = 'button';
  const fit = el('button', 'Fit picture', 'action'); fit.type = 'button';
  viewActions.append(zoomOut, zoomIn, fit);

  const selectionActions = el('div', undefined, 'editor-actions region-actions');
  const previous = el('button', 'Previous region', 'action'); previous.type = 'button';
  const next = el('button', 'Next region', 'action'); next.type = 'button';
  const fillSelected = el('button', 'Fill selected area', 'action'); fillSelected.type = 'button';
  selectionActions.append(previous, next, fillSelected);
  selectionActions.hidden = true;

  const referenceActions = el('div', undefined, 'editor-actions');
  const referenceButton = el('button', 'Show original', 'action'); referenceButton.type = 'button';
  const retryPhoto = el('button', 'Retry original photo', 'action'); retryPhoto.type = 'button'; retryPhoto.hidden = true;
  if (photo?.image) referenceActions.append(referenceButton, retryPhoto);

  const loadingError = el('div', undefined, 'editor-error');
  loadingError.hidden = true;
  const loadingErrorText = el('p');
  const retryLoad = el('button', 'Try coloring tool again', 'action'); retryLoad.type = 'button';
  loadingError.append(loadingErrorText, retryLoad);

  const dialog = el('dialog', undefined, 'reset-dialog');
  dialog.append(el('p', 'Remove the colors from this picture?'));
  const dialogActions = el('div', undefined, 'editor-actions');
  const keep = el('button', 'Keep coloring', 'action'); keep.type = 'button';
  const remove = el('button', 'Remove colors', 'action'); remove.type = 'button';
  dialogActions.append(keep, remove); dialog.append(dialogActions);

  const tools = el('aside', undefined, 'editor-tools'); tools.setAttribute('aria-label', 'Coloring tools');
  const paletteHeading = el('div', undefined, 'palette-heading'); paletteHeading.append(el('h2', 'Your colors'), historyActions);
  const saveStatus = el('p', undefined, 'save-status'); saveStatus.setAttribute('role', 'status');
  const reload = el('button', 'Reload saved version', 'action'); reload.type = 'button'; reload.hidden = true;
  reload.addEventListener('click', () => location.reload());
  const fresh = el('button', 'Keep recovery copy and start fresh', 'action'); fresh.type = 'button'; fresh.hidden = true;
  fresh.addEventListener('click', () => {
    fresh.disabled = true;
    void coloringStore.preserveAndRemove(saves.identity).then(ok => {
      if (ok) location.reload();
      else { fresh.disabled = false; saveStatus.textContent = 'The recovery copy could not be saved. Your old record has been kept.'; }
    });
  });
  const prepareDownload = el('button', 'Download my picture', 'action'); prepareDownload.type = 'button';
  const saveImage = el('a', 'Save image', 'action'); saveImage.hidden = true;
  saveImage.download = `fcc-${artwork.id}-colored.png`;
  const openImage = el('a', 'Open image', 'action'); openImage.hidden = true; openImage.target = '_blank'; openImage.rel = 'noopener';
  const downloadStatus = el('p', undefined, 'download-status'); downloadStatus.setAttribute('role', 'status');
  prepareDownload.addEventListener('click', () => {
    if (!client || !ready || exportBusy) return;
    exportBusy = true; prepareDownload.disabled = true; downloadStatus.textContent = 'Preparing picture…';
    void client.export(immutableFillSnapshot(state.fills), state.paintRevision).then(bytes => {
      if (disposed) return;
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      saveImage.href = exportUrl; openImage.href = exportUrl; saveImage.hidden = false; openImage.hidden = false;
      downloadStatus.textContent = 'Your picture is ready.';
    }).catch(() => { if (!disposed) downloadStatus.textContent = 'The picture could not be prepared. Try again.'; })
      .finally(() => { exportBusy = false; if (!disposed) prepareDownload.disabled = !ready; });
  });
  const downloads = el('div', undefined, 'editor-downloads'); downloads.append(prepareDownload, saveImage, openImage, downloadStatus);
  tools.append(paletteHeading, palette, reset, saveStatus, reload, fresh, downloads);
  if (prepared.contentVersion !== artwork.activeVersion) tools.append(el('p', 'This saved picture uses an earlier drawing version. Its original areas are kept so your colors stay in place.', 'save-status'));
  const drawingPanel = el('div', undefined, 'drawing-panel'); drawingPanel.append(referenceActions, stage, viewActions, keyboardHint, status, selectionActions, loadingError);
  host.replaceChildren(drawingPanel, tools, dialog);
  const unsubscribeSave = saves.subscribe(() => {
    saveStatus.textContent = saves.status === 'saving' ? 'Saving…' : saves.status === 'saved' ? (saves.latest ? 'Saved on this device' : 'Colors stay in this browser.') : saves.status === 'loading' ? 'Checking saved picture…'
      : saves.status === 'conflict' ? 'This picture changed in another tab. Download this version or reload to use the saved one.'
      : saves.status === 'corrupt' ? 'The saved picture could not be restored. It has been kept for recovery. New coloring stays in memory; download it to keep it.'
      : 'This picture is not saved on this device. Download it to keep it.';
    reload.hidden = saves.status !== 'conflict';
    fresh.hidden = saves.status !== 'corrupt';
  });
  function persist(): void {
    if (!ready) return;
    const view = viewport ? { zoom: relativeZoom(viewport, prepared.width, prepared.height),
      x: Math.min(1, Math.max(0, (viewport.cssWidth / 2 - viewport.translateX) / viewport.scale / prepared.width)),
      y: Math.min(1, Math.max(0, (viewport.cssHeight / 2 - viewport.translateY) / viewport.scale / prepared.height)), referenceVisible } : undefined;
    saves.save(snapshotState(state, view));
  }

  function currentRegion(): RuntimeRegion | undefined { return regions[selectedIndex]; }

  function announceSelection(prefix?: string): void {
    const region = currentRegion();
    if (!region) return;
    const fill = state.fills.get(region.id);
    const text = `${region.name}. ${fill ? `Colored ${colorName(fill)}.` : 'Not colored.'} Current color ${colorName(state.selectedColor)}.`;
    status.textContent = prefix ? `${prefix} ${text}` : text;
  }

  function updateControls(): void {
    prepareDownload.disabled = !ready || exportBusy;
    undo.disabled = !ready || state.undoStack.length === 0 || referenceVisible;
    redo.disabled = !ready || state.redoStack.length === 0 || referenceVisible;
    reset.disabled = !ready || state.fills.size === 0 || referenceVisible;
    previous.disabled = !ready || regions.length === 0 || referenceVisible;
    next.disabled = !ready || regions.length === 0 || referenceVisible;
    fillSelected.disabled = !ready || regions.length === 0 || referenceVisible;
    zoomOut.disabled = !ready || referenceVisible || !viewport || relativeZoom(viewport, prepared.width, prepared.height) <= 1.001;
    zoomIn.disabled = !ready || referenceVisible || !viewport || relativeZoom(viewport, prepared.width, prepared.height) >= 7.999;
    fit.disabled = !ready || referenceVisible;
    for (const [value, button] of paletteButtons) { button.setAttribute('aria-pressed', value === state.selectedColor ? 'true' : 'false'); button.disabled = !ready || referenceVisible; }
  }

  function drawSelection(): void {
    if (!lastFrame || !viewport || referenceVisible) return;
    const ctx = canvas.getContext('2d');
    const region = currentRegion();
    if (!ctx || !region) return;
    ctx.putImageData(lastFrame, 0, 0);
    if (!selectionVisible) return;
    const sx = canvas.width / viewport.cssWidth;
    const sy = canvas.height / viewport.cssHeight;
    const x = (viewport.translateX + region.bbox.x * viewport.scale) * sx;
    const y = (viewport.translateY + region.bbox.y * viewport.scale) * sy;
    const w = region.bbox.width * viewport.scale * sx;
    const h = region.bbox.height * viewport.scale * sy;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = Math.max(4, 3 * Math.min(sx, sy));
    ctx.strokeStyle = '#FFFFFF'; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = Math.max(2, 1.5 * Math.min(sx, sy));
    ctx.strokeStyle = '#183139'; ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function requestRender(): void {
    if (!ready || !viewport || !client || referenceVisible) return;
    client.requestRender({
      fills: immutableFillSnapshot(state.fills), viewport,
      paintRevision: state.paintRevision, viewportRevision: state.viewportRevision,
    });
  }

  function handleFrame(frame: FrameResponse): void {
    if (disposed || referenceVisible || !viewport || frame.paintRevision !== state.paintRevision || frame.viewportRevision !== state.viewportRevision) return;
    lastFrame = canvasFrame(canvas, frame);
    fallback.hidden = true;
    canvas.hidden = false;
    drawSelection();
  }

  function setViewport(nextViewport: Viewport): void {
    viewport = nextViewport;
    state = editorReducer(state, { type: 'viewport-changed' });
    state = { ...state, localStateRevision: state.localStateRevision + 1 };
    updateControls();
    requestRender();
    persist();
  }

  function revealSelected(): void {
    if (!viewport) return;
    const region = currentRegion();
    if (!region) return;
    const cx = region.centroid[0] * viewport.scale + viewport.translateX;
    const cy = region.centroid[1] * viewport.scale + viewport.translateY;
    const margin = 32;
    if (cx >= margin && cx <= viewport.cssWidth - margin && cy >= margin && cy <= viewport.cssHeight - margin) { drawSelection(); return; }
    setViewport(panViewport(viewport, prepared.width, prepared.height, viewport.cssWidth / 2 - cx, viewport.cssHeight / 2 - cy));
  }

  function selectRegion(delta: number | 'first' | 'last'): void {
    if (!ready || regions.length === 0 || referenceVisible) return;
    selectionVisible = true;
    if (delta === 'first') selectedIndex = 0;
    else if (delta === 'last') selectedIndex = regions.length - 1;
    else selectedIndex = (selectedIndex + delta + regions.length) % regions.length;
    revealSelected();
    announceSelection();
  }

  function paintRegion(regionId: number): void {
    if (!ready || referenceVisible || regionId <= 0 || regionId > prepared.regionCount) return;
    const before = state;
    state = editorReducer(state, { type: 'fill', regionId });
    if (state === before) { announceSelection('That area already has this color.'); return; }
    const region = regions.find(item => item.id === regionId);
    status.textContent = `Colored ${region?.name ?? `area ${regionId}`} ${colorName(state.selectedColor)}.`;
    updateControls(); requestRender();
    persist();
  }

  function paintSelected(): void { const region = currentRegion(); if (region) paintRegion(region.id); }

  function changeZoom(factor: number): void {
    if (!viewport || referenceVisible) return;
    const nextZoom = Math.min(8, Math.max(1, relativeZoom(viewport, prepared.width, prepared.height) * factor));
    setViewport(zoomViewportAt(viewport, prepared.width, prepared.height, nextZoom, viewport.cssWidth / 2, viewport.cssHeight / 2));
  }

  undo.addEventListener('click', () => { const nextState = editorReducer(state, { type: 'undo' }); if (nextState !== state) { state = nextState; updateControls(); requestRender(); persist(); status.textContent = 'Undid the last coloring change.'; } });
  redo.addEventListener('click', () => { const nextState = editorReducer(state, { type: 'redo' }); if (nextState !== state) { state = nextState; updateControls(); requestRender(); persist(); status.textContent = 'Redid the last coloring change.'; } });
  reset.addEventListener('click', () => { if (state.fills.size > 0 && typeof dialog.showModal === 'function') dialog.showModal(); });
  keep.addEventListener('click', () => dialog.close());
  remove.addEventListener('click', () => { dialog.close(); state = editorReducer(state, { type: 'reset-confirmed' }); updateControls(); requestRender(); persist(); status.textContent = 'Removed the colors. Undo will restore them.'; });
  zoomIn.addEventListener('click', () => changeZoom(1.25));
  zoomOut.addEventListener('click', () => changeZoom(0.8));
  fit.addEventListener('click', () => { if (viewport) setViewport(createFitViewport(viewport.cssWidth, viewport.cssHeight, prepared.width, prepared.height, devicePixelRatio)); });
  previous.addEventListener('click', () => selectRegion(-1));
  next.addEventListener('click', () => selectRegion(1));
  fillSelected.addEventListener('click', paintSelected);

  function loadReferenceImage(): void {
    if (!photo?.image) return;
    retryPhoto.hidden = true;
    reference.src = assetUrl(photo.image.web.path) + `?retry=${Date.now()}`;
  }
  reference.addEventListener('load', () => { retryPhoto.hidden = true; if (referenceVisible) status.textContent = 'Showing the original stained glass photograph.'; });
  reference.addEventListener('error', () => { retryPhoto.hidden = false; status.textContent = 'The original photograph could not be loaded.'; });
  retryPhoto.addEventListener('click', loadReferenceImage);
  referenceButton.addEventListener('click', () => {
    if (!photo?.image) return;
    referenceVisible = !referenceVisible;
    state = { ...state, localStateRevision: state.localStateRevision + 1 };
    referenceButton.textContent = referenceVisible ? 'Hide original' : 'Show original';
    if (referenceVisible) {
      gesture = 'idle'; pointers.clear();
      canvas.hidden = true; fallback.hidden = true; reference.hidden = false;
      if (!reference.src) loadReferenceImage();
      status.textContent = 'Showing the original stained glass photograph.';
    } else {
      reference.hidden = true; canvas.hidden = false;
      drawSelection(); requestRender(); announceSelection('Returned to coloring.');
    }
    updateControls();
    persist();
  });

  stage.addEventListener('keydown', event => {
    if (!ready || referenceVisible) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectRegion(-1); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectRegion(1); }
    else if (event.key === 'Home') { event.preventDefault(); selectRegion('first'); }
    else if (event.key === 'End') { event.preventDefault(); selectRegion('last'); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); paintSelected(); }
  });

  function pointerDistance(a: PointerState, b: PointerState): number { return Math.hypot(a.x - b.x, a.y - b.y); }
  function midpoint(a: PointerState, b: PointerState): { x: number; y: number } { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function clearGesture(): void { pointers.clear(); gesture = 'idle'; pinchDistance = 0; }

  stage.addEventListener('pointerdown', event => {
    if (!ready || referenceVisible || !viewport || (event.pointerType === 'mouse' && event.button !== 0)) return;
    selectionVisible = false;
    const rect = stage.getBoundingClientRect();
    const point: PointerState = { startX: event.clientX - rect.left, startY: event.clientY - rect.top, x: event.clientX - rect.left, y: event.clientY - rect.top, lastX: event.clientX - rect.left, lastY: event.clientY - rect.top };
    pointers.set(event.pointerId, point);
    stage.setPointerCapture(event.pointerId);
    if (pointers.size === 1 && gesture === 'idle') gesture = 'pendingTap';
    else if (pointers.size >= 2) {
      gesture = 'pinch';
      const pair = [...pointers.values()].slice(0, 2) as [PointerState, PointerState];
      pinchDistance = Math.max(1, pointerDistance(pair[0], pair[1]));
      pinchMidpoint = midpoint(pair[0], pair[1]);
    }
  });

  stage.addEventListener('pointermove', event => {
    const point = pointers.get(event.pointerId);
    if (!point || !viewport || referenceVisible) return;
    const rect = stage.getBoundingClientRect();
    point.x = event.clientX - rect.left; point.y = event.clientY - rect.top;
    if (gesture === 'pendingTap') {
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > 8) gesture = 'pan';
    }
    if (gesture === 'pan' && pointers.size === 1) {
      const dx = point.x - point.lastX; const dy = point.y - point.lastY;
      point.lastX = point.x; point.lastY = point.y;
      setViewport(panViewport(viewport, prepared.width, prepared.height, dx, dy));
    } else if (gesture === 'pinch' && pointers.size >= 2) {
      const pair = [...pointers.values()].slice(0, 2) as [PointerState, PointerState];
      const distance = Math.max(1, pointerDistance(pair[0], pair[1]));
      const mid = midpoint(pair[0], pair[1]);
      let nextViewport = panViewport(viewport, prepared.width, prepared.height, mid.x - pinchMidpoint.x, mid.y - pinchMidpoint.y);
      const zoom = relativeZoom(nextViewport, prepared.width, prepared.height) * distance / pinchDistance;
      nextViewport = zoomViewportAt(nextViewport, prepared.width, prepared.height, zoom, mid.x, mid.y);
      pinchDistance = distance; pinchMidpoint = mid;
      setViewport(nextViewport);
    }
  });

  function endPointer(event: PointerEvent, cancelled: boolean): void {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    const wasTap = gesture === 'pendingTap' && pointers.size === 1 && !cancelled;
    pointers.delete(event.pointerId);
    try { if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (wasTap && viewport && hitLabels) {
      const rect = stage.getBoundingClientRect();
      const image = clientPointToImage(viewport, event.clientX, event.clientY, rect.left, rect.top, prepared.width, prepared.height);
      if (image) paintRegion(hitLabels[image.y * prepared.width + image.x] ?? 0);
    }
    if (gesture === 'pinch') {
      if (pointers.size === 0) gesture = 'idle';
    } else if (pointers.size === 0) gesture = 'idle';
  }
  stage.addEventListener('pointerup', event => endPointer(event, false));
  stage.addEventListener('pointercancel', event => endPointer(event, true));
  stage.addEventListener('lostpointercapture', event => { if (pointers.has(event.pointerId)) clearGesture(); });

  function onResize(): void {
    if (!ready) return;
    const rect = stage.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, Math.max(1, devicePixelRatio));
    if (viewport && viewport.cssWidth === rect.width && viewport.cssHeight === rect.height
        && viewport.pixelWidth === Math.round(rect.width * dpr) && viewport.pixelHeight === Math.round(rect.height * dpr)) return;
    if (!viewport) setViewport(createFitViewport(rect.width, rect.height, prepared.width, prepared.height, devicePixelRatio));
    else setViewport(resizeViewport(viewport, prepared.width, prepared.height, rect.width, rect.height, devicePixelRatio));
    clearGesture();
  }

  function startClient(): void {
    if (disposed || signal.aborted) return;
    ready = false; loadingError.hidden = true; retryLoad.disabled = true;
    fallback.hidden = false; canvas.hidden = true;
    status.textContent = 'Preparing coloring tool…'; updateControls();
    client?.dispose();
    client = new ColoringWorkerClient(artwork, prepared, handleFrame, message => { status.textContent = message; });
    const loadingClient = client;
    void loadingClient.load().then(async result => {
      await saves.loaded;
      if (disposed || signal.aborted || client !== loadingClient) return;
      const saved = saves.latest;
      if (saved) state = { ...initialEditorState(), ...saved, fills: new Map(saved.fills) };
      hitLabels = new Uint32Array(result.hitLabels);
      regions = result.regions;
      selectedIndex = 0;
      ready = true;
      retryLoad.disabled = false;
      const rect = stage.getBoundingClientRect();
      viewport = createFitViewport(Math.max(1, rect.width), Math.max(1, rect.height), result.width, result.height, devicePixelRatio);
      if (saved?.view) {
        const scale = viewport.scale * saved.view.zoom;
        viewport = clampViewport({ ...viewport, scale, translateX: viewport.cssWidth / 2 - saved.view.x * prepared.width * scale,
          translateY: viewport.cssHeight / 2 - saved.view.y * prepared.height * scale }, prepared.width, prepared.height);
      }
      state = editorReducer(state, { type: 'viewport-changed' });
      fallback.hidden = true; canvas.hidden = false;
      referenceVisible = Boolean(saved?.view?.referenceVisible && photo?.image);
      reference.hidden = !referenceVisible;
      canvas.hidden = referenceVisible;
      referenceButton.textContent = referenceVisible ? 'Hide original' : 'Show original';
      if (referenceVisible && !reference.src) loadReferenceImage();
      updateControls(); requestRender(); announceSelection();
      resizeObserver = new ResizeObserver(onResize); resizeObserver.observe(stage);
    }).catch(error => {
      if (disposed || signal.aborted || client !== loadingClient) return;
      ready = false; retryLoad.disabled = false;
      loadingErrorText.textContent = error instanceof Error ? error.message : 'The coloring tool could not be loaded.';
      loadingError.hidden = false;
      status.textContent = 'The coloring tool could not be loaded.';
      fallback.hidden = false; canvas.hidden = true;
      updateControls();
    });
  }
  retryLoad.addEventListener('click', startClient);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    unsubscribeSave();
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    client?.dispose();
    clearGesture();
    if (dialog.open) dialog.close();
  }
  signal.addEventListener('abort', dispose, { once: true });
  startClient();
  return dispose;
}
