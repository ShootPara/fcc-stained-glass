import { CliError, isMain, parseNamedArgs, runCli } from './lib/cli.js';
import type { PreparationOptions } from './lib/prepare-artwork.js';

const usage = 'Prepare artwork: npm run prepare -- --id design-002  OR  npm run prepare -- --all\nPhotos only: npm run prepare -- --all --photos-only';

export function parsePreparationArgs(args: string[]): PreparationOptions & { help: boolean } {
  const values = parseNamedArgs(args, { id: 'value', all: 'boolean', 'include-archives': 'boolean', 'photos-only': 'boolean', help: 'boolean' });
  if (values.help) return { help: true };
  if (Boolean(values.id) === Boolean(values.all) || (values['include-archives'] && !values.all)
      || (values['photos-only'] && (!values.all || values['include-archives']))
      || (values.id && !/^design-0(?:0[2-9]|[1-3][0-9]|4[0-9])$/.test(String(values.id)))) {
    throw new CliError('E_ARGUMENTS', `Choose one valid --id or --all. --include-archives requires --all.\n${usage}`, 2);
  }
  return { id: values.id as string | undefined, all: values.all === true, includeArchives: values['include-archives'] === true,
    ...(values['photos-only'] ? { photosOnly: true } : {}), help: false };
}

async function main(): Promise<void> {
  // npm ci/install invoke prepare without arguments. The heavy module is not
  // even imported on this successful no-source-access, no-write lifecycle path.
  if (process.argv.length === 2) { console.log(`${usage}\nNo assets changed.`); return; }
  await runCli({ operation: 'prepare-assets' }, async report => {
    const options = parsePreparationArgs(process.argv.slice(2));
    if (options.help) { console.log(`${usage}\nAdd --include-archives with --all to regenerate retained versions.`); return; }
    report.scope = options.id ?? (options.includeArchives ? 'all and archives' : 'all');
    const { prepareAssets } = await import('./lib/prepare-artwork.js');
    const result = await prepareAssets(options, undefined, report);
    console.log(`Prepared ${result.artworks.length} drawing version(s) and ${result.photos.length} photo derivative(s). Inspect the reported review images; preparation writes no review receipts.`);
  });
}

if (isMain(import.meta.url)) await main();
