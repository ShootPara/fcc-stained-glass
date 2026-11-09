export interface Viewport {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ImagePoint { x: number; y: number }

export function fitScale(cssWidth: number, cssHeight: number, imageWidth: number, imageHeight: number): number {
  if (![cssWidth, cssHeight, imageWidth, imageHeight].every(Number.isFinite) || cssWidth <= 0 || cssHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return 0;
  return Math.min(cssWidth / imageWidth, cssHeight / imageHeight);
}

function clampTranslation(value: number, stageSize: number, imageSize: number): number {
  if (imageSize <= stageSize) return (stageSize - imageSize) / 2;
  return Math.min(0, Math.max(stageSize - imageSize, value));
}

export function clampViewport(viewport: Viewport, imageWidth: number, imageHeight: number): Viewport {
  const renderedWidth = imageWidth * viewport.scale;
  const renderedHeight = imageHeight * viewport.scale;
  return {
    ...viewport,
    translateX: clampTranslation(viewport.translateX, viewport.cssWidth, renderedWidth),
    translateY: clampTranslation(viewport.translateY, viewport.cssHeight, renderedHeight),
  };
}

export function createFitViewport(cssWidth: number, cssHeight: number, imageWidth: number, imageHeight: number, dpr = 1): Viewport {
  const scale = fitScale(cssWidth, cssHeight, imageWidth, imageHeight);
  const pixelRatio = Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const viewport: Viewport = {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
    scale,
    translateX: (cssWidth - imageWidth * scale) / 2,
    translateY: (cssHeight - imageHeight * scale) / 2,
  };
  return clampViewport(viewport, imageWidth, imageHeight);
}

export function relativeZoom(viewport: Viewport, imageWidth: number, imageHeight: number): number {
  const fit = fitScale(viewport.cssWidth, viewport.cssHeight, imageWidth, imageHeight);
  return fit > 0 ? viewport.scale / fit : 1;
}

export function zoomViewportAt(viewport: Viewport, imageWidth: number, imageHeight: number, zoomRelativeToFit: number, anchorX: number, anchorY: number): Viewport {
  const fit = fitScale(viewport.cssWidth, viewport.cssHeight, imageWidth, imageHeight);
  if (fit <= 0) return viewport;
  const nextScale = fit * Math.min(8, Math.max(1, zoomRelativeToFit));
  const imageX = (anchorX - viewport.translateX) / viewport.scale;
  const imageY = (anchorY - viewport.translateY) / viewport.scale;
  return clampViewport({
    ...viewport,
    scale: nextScale,
    translateX: anchorX - imageX * nextScale,
    translateY: anchorY - imageY * nextScale,
  }, imageWidth, imageHeight);
}

export function panViewport(viewport: Viewport, imageWidth: number, imageHeight: number, deltaX: number, deltaY: number): Viewport {
  return clampViewport({ ...viewport, translateX: viewport.translateX + deltaX, translateY: viewport.translateY + deltaY }, imageWidth, imageHeight);
}

export function resizeViewport(viewport: Viewport, imageWidth: number, imageHeight: number, cssWidth: number, cssHeight: number, dpr = 1): Viewport {
  const oldCenterX = (viewport.cssWidth / 2 - viewport.translateX) / viewport.scale;
  const oldCenterY = (viewport.cssHeight / 2 - viewport.translateY) / viewport.scale;
  const zoom = relativeZoom(viewport, imageWidth, imageHeight);
  const next = createFitViewport(cssWidth, cssHeight, imageWidth, imageHeight, dpr);
  const scale = next.scale * Math.min(8, Math.max(1, zoom));
  return clampViewport({
    ...next,
    scale,
    translateX: cssWidth / 2 - oldCenterX * scale,
    translateY: cssHeight / 2 - oldCenterY * scale,
  }, imageWidth, imageHeight);
}

export function clientPointToImage(viewport: Viewport, clientX: number, clientY: number, rectLeft: number, rectTop: number, imageWidth: number, imageHeight: number): ImagePoint | null {
  if (!Number.isFinite(viewport.scale) || viewport.scale <= 0) return null;
  const stageX = clientX - rectLeft;
  const stageY = clientY - rectTop;
  const x = Math.floor((stageX - viewport.translateX) / viewport.scale);
  const y = Math.floor((stageY - viewport.translateY) / viewport.scale);
  if (x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) return null;
  return { x, y };
}

export function outputPixelCenterToImage(viewport: Viewport, px: number, py: number): { x: number; y: number } {
  const cssX = (px + 0.5) * viewport.cssWidth / viewport.pixelWidth;
  const cssY = (py + 0.5) * viewport.cssHeight / viewport.pixelHeight;
  return {
    x: (cssX - viewport.translateX) / viewport.scale,
    y: (cssY - viewport.translateY) / viewport.scale,
  };
}
