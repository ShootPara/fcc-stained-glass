import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalJson, jsonBytes, sha256Bytes, sha256File } from '../../scripts/lib/digests.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('measured digests and canonical JSON', () => {
  it('matches the published SHA-256 test vector and streaming file bytes', async () => {
    const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(sha256Bytes('abc')).toBe(digest);
    const root = await mkdtemp(path.join(tmpdir(), 'fcc digest '));
    directories.push(root);
    await writeFile(path.join(root, 'input.bin'), Buffer.from('abc'));
    expect(await sha256File(path.join(root, 'input.bin'))).toBe(digest);
  });

  it('sorts object keys recursively while preserving meaningful array order', () => {
    const first = { z: [3, { b: 2, a: 1 }], a: 'church' };
    const second = { a: 'church', z: [3, { a: 1, b: 2 }] };
    expect(canonicalJson(first)).toBe('{"a":"church","z":[3,{"a":1,"b":2}]}');
    expect(sha256Bytes(canonicalJson(first))).toBe(sha256Bytes(canonicalJson(second)));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
  });

  it('writes readable UTF-8 JSON with LF and one final newline', () => {
    expect(jsonBytes({ b: 2, a: 'é' }).toString('utf8')).toBe('{\n  "a": "é",\n  "b": 2\n}\n');
  });

  it.each([undefined, NaN, Infinity, { omitted: undefined }, [undefined], new Date(), new Set([1])])('rejects values JSON would silently change: %j', value => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('rejects cycles, symbols and sparse arrays even with compensating extra keys', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(/circular/);
    expect(() => canonicalJson({ [Symbol('hidden')]: 'value' })).toThrow(/symbol/);
    const sparse = new Array(1);
    Object.assign(sparse, { extra: 'not an index' });
    expect(() => canonicalJson(sparse)).toThrow(/sparse/);
    expect(() => canonicalJson(new Array(1))).toThrow(/sparse/);
  });
});
