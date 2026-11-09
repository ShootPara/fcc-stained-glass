/// <reference lib="dom" />
/** @vitest-environment happy-dom */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const stylesheetPath = path.join(process.cwd(), 'src/styles.css');

async function mountEditorLayers(): Promise<{
  canvas: HTMLCanvasElement;
  fallback: HTMLImageElement;
  reference: HTMLImageElement;
  retry: HTMLButtonElement;
}> {
  const style = document.createElement('style');
  style.textContent = await readFile(stylesheetPath, 'utf8');
  document.head.append(style);

  const stage = document.createElement('section');
  stage.className = 'editor-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'editor-canvas';
  const fallback = document.createElement('img');
  fallback.className = 'editor-fallback';
  const reference = document.createElement('img');
  reference.className = 'editor-reference';
  reference.hidden = true;
  stage.append(canvas, fallback, reference);

  const retry = document.createElement('button');
  retry.className = 'action';
  retry.hidden = true;
  document.body.append(stage, retry);
  return { canvas, fallback, reference, retry };
}

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('editor rendered visibility', () => {
  it('keeps hidden editor layers and retry controls out of layout while preserving their display state when shown', async () => {
    const { canvas, fallback, reference, retry } = await mountEditorLayers();

    // This uses the computed display value from the stylesheet, rather than
    // merely asserting the presence of the hidden attribute.
    expect(getComputedStyle(canvas).display).toBe('block');
    expect(getComputedStyle(fallback).display).toBe('block');
    expect(getComputedStyle(reference).display).toBe('none');
    expect(getComputedStyle(retry).display).toBe('none');

    // Mirror the view's Show original transition.
    canvas.hidden = true;
    fallback.hidden = true;
    reference.hidden = false;
    expect(getComputedStyle(canvas).display).toBe('none');
    expect(getComputedStyle(fallback).display).toBe('none');
    expect(getComputedStyle(reference).display).toBe('block');

    // Retry is only rendered after the image's error transition clears hidden.
    retry.hidden = false;
    expect(getComputedStyle(retry).display).toBe('inline-flex');
  });
});
