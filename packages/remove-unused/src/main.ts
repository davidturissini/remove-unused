import yargs from 'yargs/yargs';
import { analyze } from '@remove-unused/engine';

main();

export async function main() {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs(process.argv.slice(2))
    .command(
      '$0 [cwd]',
      'Remove unused files from your project',
      // @ts-expect-error For some reason, the yargs types doesn't like this even though its valid
      async (yargs) => {
        return yargs.positional('cwd', {
          describe: 'Directory to scan',
          default: process.cwd(),
        });
      },
      async ({ cwd }: { cwd: string }) => {
        const results = await analyze({
          cwd,
        });
        process.stdout.write(JSON.stringify(results, null, 2));
      },
    )
    .command(
      'report [cwd]',
      'Report unused files',
      // @ts-expect-error For some reason, the yargs types doesn't like this even though its valid
      async (yargs) => {
        return yargs.positional('cwd', {
          describe: 'Directory to scan',
          default: process.cwd(),
        });
      },
      async ({ cwd }: { cwd: string }) => {
        const results = await analyze({
          cwd,
        });
        process.stdout.write(JSON.stringify(results.unusedFiles, null, 2));
      },
    )
    .help().argv;
}
