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
      async ({
        cwd,
        package: packageFilter,
      }: {
        cwd: string;
        package: string[];
      }) => {
        const results = await analyze({
          cwd,
          packages: packageFilter,
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
      async (args: { cwd: string; packageFilter: string[] }) => {
        const { cwd, packageFilter } = args;
        const results = await analyze({
          cwd,
          packages: packageFilter,
        });
        process.stdout.write(JSON.stringify(results.unusedFiles, null, 2));
      },
    )
    .option('package', {
      alias: 'p',
      type: 'array',
      description: 'filter packages',
    })
    .help().argv;
}
