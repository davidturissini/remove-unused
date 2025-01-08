import { existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  if (packageJson.dependencies?.['better-node-test'] === undefined && packageJson.devDependencies?.['better-node-test'] === undefined) {
    return;
  }

  
  return {
    name: 'better-node-test',
    fileBelongsTo(path) {
      return /\.test\.(js|ts)/.test(path);
    }
  }
}