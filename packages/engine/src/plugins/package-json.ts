import { join as pathJoin, extname } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';
import { existsSync } from 'node:fs';


function getPackageEntryPoints(cwd: string, packageJson: PackageJsonSchema) {
  const { main, types, exports } = packageJson;
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

  if (exports !== undefined) {
    Object.values(exports).forEach((filePath) => {
      entryPoints[
        pathJoin(cwd, filePath)
      ] = true;
    })
  }

  return entryPoints;
}

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  const entryPoints = getPackageEntryPoints(cwd, packageJson);

  Object.keys(entryPoints).forEach((key) => {
    state.addRef(key);
    const extName = extname(key);
    if (extName === '.js' && existsSync(key.replace('.js', '.d.ts'))) {
        state.addRef(key.replace('.js', '.d.ts'));
      } 
  });

  return undefined;
}