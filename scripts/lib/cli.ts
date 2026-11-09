import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PROJECT_ROOT, assertSafeProjectPath, relativeProjectPath } from './paths.js';

export type FailureExitCode = 2 | 3 | 4 | 5 | 6;

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: FailureExitCode = 3,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export interface RunReport {
  schemaVersion: 1;
  operation: string;
  scope: string;
  startedAtUtc: string;
  completedAtUtc?: string;
  status: 'running' | 'passed' | 'failed';
  exitCode: number;
  inputs: string[];
  outputs: string[];
  digests: Record<string, string>;
  warnings: string[];
  errors: Array<{ code: string; message: string; details?: unknown }>;
  summary?: unknown;
}

export async function runCli(
  options: { operation: string; root?: string; scope?: string },
  execute: (report: RunReport) => Promise<void>,
): Promise<void> {
  const root = options.root ?? PROJECT_ROOT;
  const report: RunReport = {
    schemaVersion: 1,
    operation: options.operation,
    scope: options.scope ?? 'project',
    startedAtUtc: new Date().toISOString(),
    status: 'running',
    exitCode: 0,
    inputs: [], outputs: [], digests: {}, warnings: [], errors: [],
  };
  try {
    await execute(report);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    const failure = error instanceof CliError
      ? error
      : new CliError('E_PROCESSING', error instanceof Error ? error.message : String(error), 5);
    report.exitCode = failure.exitCode;
    report.errors.push({ code: failure.code, message: failure.message, ...(failure.details === undefined ? {} : { details: failure.details }) });
    console.error(`${failure.code}: ${failure.message}`);
  }
  report.completedAtUtc = new Date().toISOString();
  try {
    const directory = await assertSafeProjectPath('.work/reports', root, { allowMissing: true });
    await mkdir(directory, { recursive: true });
    const operation = options.operation.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${operation}-${report.startedAtUtc.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`;
    const destination = path.join(directory, filename);
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(`${options.operation}: ${report.status}. Report: ${relativeProjectPath(destination, root)}`);
    if (report.summary !== undefined) console.log(JSON.stringify(report.summary, null, 2));
  } catch (error) {
    console.error(`E_REPORT_WRITE: ${error instanceof Error ? error.message : String(error)}`);
    report.exitCode ||= 5;
  }
  if (report.exitCode !== 0) process.exitCode = report.exitCode;
}

export function isMain(moduleUrl: string): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

export function parseNamedArgs(
  argv: string[],
  definitions: Record<string, 'boolean' | 'value'>,
): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(token);
    if (!match) throw new CliError('E_ARGUMENT', `Unexpected argument: ${token}`, 2);
    const name = match[1]!;
    const kind = definitions[name];
    if (kind === undefined) throw new CliError('E_ARGUMENT', `Unknown option: --${name}`, 2);
    if (Object.hasOwn(parsed, name)) throw new CliError('E_ARGUMENT', `Option --${name} was supplied more than once.`, 2);
    if (kind === 'boolean') {
      if (match[2] !== undefined) throw new CliError('E_ARGUMENT', `--${name} does not take a value.`, 2);
      parsed[name] = true;
    } else {
      const value = match[2] ?? argv[++index];
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new CliError('E_ARGUMENT', `--${name} requires a value. Quote paths containing spaces.`, 2);
      }
      parsed[name] = value;
    }
  }
  return parsed;
}
