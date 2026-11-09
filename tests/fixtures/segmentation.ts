import type { CanonicalImage } from '../../scripts/lib/algorithms/gray-v1.js';

/** Tiny authored pixel fixtures; # is black ink and . is opaque white. */
export function grayFixture(rows: readonly string[], extraValues: Record<string, number> = {}): CanonicalImage {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some(row => row.length !== width)) throw new Error('Fixture rows must have equal positive width.');
  const legend: Record<string, number> = { '#': 0, '.': 255, ...extraValues };
  const pixels = new Uint8Array(width * rows.length);
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < width; x += 1) {
      const value = legend[row[x]!];
      if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`Unknown/invalid fixture pixel ${row[x]}.`);
      pixels[y * width + x] = value;
    }
  }
  return { width, height: rows.length, pixels };
}

/** X marks a selected 255-valued mask pixel; every other character is zero. */
export function maskFixture(rows: readonly string[]): Uint8Array {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some(row => row.length !== width)) throw new Error('Mask fixture rows must have equal positive width.');
  return Uint8Array.from(rows.join(''), character => character === 'X' ? 255 : 0);
}

export const fixtures = {
  diagonal: () => grayFixture(['.#', '#.']),
  onePixelGap: () => grayFixture(['#######', '#..#..#', '#.....#', '#..#..#', '#######']),
  smallPane: () => grayFixture(['#######', '#.#...#', '#######']),
  antialiasedBoundary: () => grayFixture(['.ab#ba.'], { a: 192, b: 96 }),
  framedPane: () => grayFixture(['.......', '.#####.', '.#...#.', '.#####.', '.......']),
  captionAndExterior: () => grayFixture([
    '.............',
    '.###########.',
    '.#.........#.',
    '.#.........#.',
    '.###########.',
    '.............',
    '...###.###...',
    '...#.#.#.#...',
    '...###.###...',
    '.............',
  ]),
};
