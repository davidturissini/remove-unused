import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';


function getPackageEntryPoints(cwd: string, packageJson: PackageJsonSchema) {
  const { main, types } = packageJson;
  const entryPoints: Record<string, true> = {};

  [
    main, types
  ].forEach((filePath) => {
    if (filePath !== undefined) {
      entryPoints[
        pathJoin(cwd, filePath)
      ] = true;
    }
  });

  return entryPoints;
}

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  const entryPoints = getPackageEntryPoints(cwd, packageJson);

  Object.keys(entryPoints).forEach((key) => {
    state.addRef(key);
  });

  return undefined;
}