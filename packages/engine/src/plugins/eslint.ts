import { existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { PackageJsonSchema, State } from '../analyze.js';

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }) {
  if (packageJson.dependencies?.eslint === undefined && packageJson.devDependencies?.eslint === undefined) {
    return;
  }

  const configFile = 'eslint.config.js';
  const fullPath = pathJoin(cwd, configFile);
  if (existsSync(fullPath) === true) {
    state.addRef(fullPath)
  };
}