import { join as pathJoin, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { createPlugin } from '../plugin.js';
import { addFileReference, PackageJsonSchema } from '../package.js';

function getPackageEntryPoints(cwd: string, packageJson: PackageJsonSchema) {
  const { main, types, exports } = packageJson;
  const entryPoints: Record<string, true> = {};

  [main, types].forEach((filePath) => {
    if (filePath !== undefined) {
      entryPoints[pathJoin(cwd, filePath)] = true;
    }
  });

  if (exports !== undefined) {
    Object.values(exports).forEach((filePath) => {
      if (typeof filePath === 'string') {
        entryPoints[pathJoin(cwd, filePath)] = true;
        return;
      }

      Object.keys(filePath).forEach((entryName) => {
        const value = filePath[entryName];
        if (typeof value === 'string') {
          entryPoints[pathJoin(cwd, value)] = true;
          return;
        }
        Object.keys(value).forEach((entryName) => {
          const name = value[entryName];
          entryPoints[pathJoin(cwd, name)] = true;
        });
      });
    });
  }

  return entryPoints;
}

export const plugin = createPlugin(({ packageDef }) => {
  const { packageJson, cwd } = packageDef;
  const entryPoints = getPackageEntryPoints(cwd, packageJson);

  Object.keys(entryPoints).forEach((key) => {
    addFileReference(packageDef, key);
    const extName = extname(key);
    if (extName === '.js' && existsSync(key.replace('.js', '.d.ts'))) {
      addFileReference(packageDef, key.replace('.js', '.d.ts'));
    }
  });

  return undefined;
});
