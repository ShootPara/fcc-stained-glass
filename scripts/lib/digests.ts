import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(absolutePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digest('hex');
}

function canonicalValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new TypeError('Canonical JSON contains an unsupported value.');
  if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot contain circular references.');
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Canonical JSON cannot contain symbol keys.');
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, index) => index).some(index => !Object.hasOwn(value, index))) {
      throw new TypeError('Canonical JSON cannot contain sparse arrays or array properties.');
    }
    return value.map(item => canonicalValue(item, next));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Canonical JSON requires plain objects.');
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort()) output[key] = canonicalValue((value as Record<string, unknown>)[key], next);
  return output;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set()));
}

export function jsonBytes(value: unknown): Buffer {
  // Validate first: JSON.stringify would otherwise silently omit undefined.
  return Buffer.from(`${JSON.stringify(canonicalValue(value, new Set()), null, 2)}\n`, 'utf8');
}
