import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditorState, PALETTE } from '../../src/editor/reducer.js';

describe('editor reducer', () => {
  it('defaults to blue and treats explicit white as a real fill', () => {
    let state = initialEditorState();
    expect(state.selectedColor).toBe('#1976D2');
    state = editorReducer(state, { type: 'select-color', color: '#FFFFFF' });
    state = editorReducer(state, { type: 'fill', regionId: 7 });
    expect(state.fills.get(7)).toBe('#FFFFFF');
    expect(state.undoStack).toHaveLength(1);
  });

  it('makes same-color fills no-ops and clears redo after a new fill', () => {
    let state = initialEditorState();
    state = editorReducer(state, { type: 'fill', regionId: 2 });
    const unchanged = editorReducer(state, { type: 'fill', regionId: 2 });
    expect(unchanged).toBe(state);
    state = editorReducer(state, { type: 'undo' });
    expect(state.redoStack).toHaveLength(1);
    state = editorReducer(state, { type: 'fill', regionId: 3 });
    expect(state.redoStack).toHaveLength(0);
  });

  it('undoes and redoes a fill', () => {
    let state = initialEditorState();
    state = editorReducer(state, { type: 'fill', regionId: 4 });
    state = editorReducer(state, { type: 'undo' });
    expect(state.fills.has(4)).toBe(false);
    state = editorReducer(state, { type: 'redo' });
    expect(state.fills.get(4)).toBe('#1976D2');
  });

  it('treats reset as one undoable command', () => {
    let state = initialEditorState();
    state = editorReducer(state, { type: 'fill', regionId: 1 });
    state = editorReducer(state, { type: 'select-color', color: '#D32F2F' });
    state = editorReducer(state, { type: 'fill', regionId: 2 });
    const before = new Map(state.fills);
    state = editorReducer(state, { type: 'reset-confirmed' });
    expect(state.fills.size).toBe(0);
    expect(state.undoStack.at(-1)?.kind).toBe('reset');
    state = editorReducer(state, { type: 'undo' });
    expect([...state.fills]).toEqual([...before]);
  });

  it('keeps only the newest 100 history commands', () => {
    let state = initialEditorState();
    for (let i = 1; i <= 105; i += 1) state = editorReducer(state, { type: 'fill', regionId: i });
    expect(state.undoStack).toHaveLength(100);
    expect(state.undoStack[0]?.changes[0]?.regionId).toBe(6);
  });

  it('contains the required twelve named colors', () => {
    expect(PALETTE).toHaveLength(12);
    expect(PALETTE.map(item => item.name)).toEqual(['Red','Orange','Yellow','Green','Blue','Light blue','Purple','Pink','Brown','Gray','Black','White']);
  });
});
