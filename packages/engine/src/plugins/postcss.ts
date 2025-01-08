import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  const { dependencies, devDependencies } = packageJson;
  if (dependencies?.postcss === undefined && devDependencies?.postcss === undefined) {
    return undefined;
  }
  
  const config = pathJoin(cwd, 'postcss.config.js');
  state.addRef(config);
}