import yargs from 'yargs/yargs';
import { analyze } from '@remove-unused/engine';

main()

export async function main() {
  yargs(process.argv.slice(2))
    .command(
      '$0 [cwd]',
      'Remove unused files from your project',
      // @ts-expect-error
      async (yargs) => {
        return yargs.positional('cwd', {
          describe: 'Directory to scan',
          default: process.cwd(),
        });
      }, async ({ cwd }: { cwd: string }) => {
        const results = await analyze({
          cwd,
        });
        process.stdout.write(JSON.stringify(results, null, 2));
      })
    .help().argv;
}