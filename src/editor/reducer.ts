export type HexColor = `#${string}`;

export const PALETTE = Object.freeze([
  { name: 'Red', value: '#D32F2F' },
  { name: 'Orange', value: '#F57C00' },
  { name: 'Yellow', value: '#FBC02D' },
  { name: 'Green', value: '#388E3C' },
  { name: 'Blue', value: '#1976D2' },
  { name: 'Light blue', value: '#81D4FA' },
  { name: 'Purple', value: '#7B1FA2' },
  { name: 'Pink', value: '#EC8EB5' },
  { name: 'Brown', value: '#795548' },
  { name: 'Gray', value: '#9E9E9E' },
  { name: 'Black', value: '#171717' },
  { name: 'White', value: '#FFFFFF' },
] as const satisfies readonly { name: string; value: HexColor }[]);

export const DEFAULT_COLOR: HexColor = '#1976D2';
const MAX_HISTORY = 100;

export interface FillChange {
  regionId: number;
  before: HexColor | undefined;
  after: HexColor | undefined;
}

export interface HistoryCommand {
  kind: 'fill' | 'reset';
  changes: readonly FillChange[];
}

export interface EditorState {
  selectedColor: HexColor;
  fills: ReadonlyMap<number, HexColor>;
  undoStack: readonly HistoryCommand[];
  redoStack: readonly HistoryCommand[];
  paintRevision: number;
  viewportRevision: number;
  localStateRevision: number;
}

export type EditorAction =
  | { type: 'select-color'; color: HexColor }
  | { type: 'fill'; regionId: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset-confirmed' }
  | { type: 'viewport-changed' };

export function initialEditorState(): EditorState {
  return {
    selectedColor: DEFAULT_COLOR,
    fills: new Map(),
    undoStack: [],
    redoStack: [],
    paintRevision: 0,
    viewportRevision: 0,
    localStateRevision: 0,
  };
}

function trimHistory(commands: readonly HistoryCommand[]): readonly HistoryCommand[] {
  return commands.length <= MAX_HISTORY ? commands : commands.slice(commands.length - MAX_HISTORY);
}

function applyChanges(source: ReadonlyMap<number, HexColor>, changes: readonly FillChange[], direction: 'before' | 'after'): Map<number, HexColor> {
  const next = new Map(source);
  for (const change of changes) {
    const value = change[direction];
    if (value === undefined) next.delete(change.regionId);
    else next.set(change.regionId, value);
  }
  return next;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select-color':
      if (state.selectedColor === action.color) return state;
      return { ...state, selectedColor: action.color, localStateRevision: state.localStateRevision + 1 };
    case 'viewport-changed':
      return { ...state, viewportRevision: state.viewportRevision + 1 };
    case 'fill': {
      if (!Number.isInteger(action.regionId) || action.regionId <= 0) return state;
      const before = state.fills.get(action.regionId);
      if (before === state.selectedColor) return state;
      const change: FillChange = { regionId: action.regionId, before, after: state.selectedColor };
      const command: HistoryCommand = { kind: 'fill', changes: [change] };
      return {
        ...state,
        fills: applyChanges(state.fills, command.changes, 'after'),
        undoStack: trimHistory([...state.undoStack, command]),
        redoStack: [],
        paintRevision: state.paintRevision + 1,
        localStateRevision: state.localStateRevision + 1,
      };
    }
    case 'reset-confirmed': {
      if (state.fills.size === 0) return state;
      const changes: FillChange[] = [...state.fills.entries()]
        .sort(([a], [b]) => a - b)
        .map(([regionId, before]) => ({ regionId, before, after: undefined }));
      const command: HistoryCommand = { kind: 'reset', changes };
      return {
        ...state,
        fills: new Map(),
        undoStack: trimHistory([...state.undoStack, command]),
        redoStack: [],
        paintRevision: state.paintRevision + 1,
        localStateRevision: state.localStateRevision + 1,
      };
    }
    case 'undo': {
      const command = state.undoStack.at(-1);
      if (!command) return state;
      return {
        ...state,
        fills: applyChanges(state.fills, command.changes, 'before'),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        paintRevision: state.paintRevision + 1,
        localStateRevision: state.localStateRevision + 1,
      };
    }
    case 'redo': {
      const command = state.redoStack.at(-1);
      if (!command) return state;
      return {
        ...state,
        fills: applyChanges(state.fills, command.changes, 'after'),
        undoStack: trimHistory([...state.undoStack, command]),
        redoStack: state.redoStack.slice(0, -1),
        paintRevision: state.paintRevision + 1,
        localStateRevision: state.localStateRevision + 1,
      };
    }
  }
}

export function immutableFillSnapshot(fills: ReadonlyMap<number, HexColor>): readonly [number, HexColor][] {
  return [...fills.entries()].sort(([a], [b]) => a - b);
}
