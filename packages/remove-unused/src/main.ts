import yargs from 'yargs/yargs';
import { analyze } from '@remove-unused/engine';

main()

export function main() {
  yargs()
    .command('$0 [cwd]', 'Remove unused files from your project', async (yargs) => {
      return yargs.positional('cwd', {
        describe: 'Directory to scan',
        default: process.cwd(),
      });
    }, async ({ cwd }: { cwd: string }) => {
      const results = await analyze({
        cwd,
      });
      console.log(results);
    })
    .help().argv
}