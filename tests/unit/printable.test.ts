import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeSheet, printInputs, validatePrint } from '../../scripts/lib/printable.js';
import { PROJECT_ROOT } from '../../scripts/lib/paths.js';

describe('representative printable PDF', () => {
  it('verifies the committed sheet against its current inputs and hash', async () => {
    const receipt = await validatePrint(PROJECT_ROOT);
    expect(receipt.pages).toBe(1); expect(receipt.effectiveDpi).toBeGreaterThan(170);
  });
  it('wraps long titles and retains a Letter page and native drawing', async () => {
    const input = await printInputs(PROJECT_ROOT);
    const output = await makeSheet({ ...input, title: 'A representative stained glass drawing with a deliberately long title that wraps onto several readable lines' });
    const pdf = await PDFDocument.load(output.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0]!.getSize()).toEqual({ width: 612, height: 792 });
    expect(output.effectiveDpi).toBeGreaterThan(170);
  });
});
