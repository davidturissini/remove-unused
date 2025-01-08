import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  const { scripts: packageJsonScripts } = packageJson;
  if (packageJsonScripts === undefined) {
    return undefined;
  }

  Object.values(packageJsonScripts).forEach((command) => {
    const split = command.split(' ');
    if (split[0] === 'node') {
      const abs = pathJoin(cwd, split[1]);
      state.addRef(abs);
    }
  });
}