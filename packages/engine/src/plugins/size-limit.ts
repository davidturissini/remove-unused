import { existsSync } from 'node:fs';
import { createPlugin } from '../plugin.js';
import { join as pathJoin } from 'node:path';
import { addFileReference, packageHasDependency } from '../package.js';

const CONFIG_FILES = [
  '.size-limit.json',
  '.size-limit.js',
  '.size-limit.cjs',
  '.size-limit.ts',
];

export const plugin = createPlugin(({ packageDef }) => {
  if (packageHasDependency(packageDef, 'size-limit') === false) {
    return;
  }

  CONFIG_FILES.forEach((configFile) => {
    const fullPath = pathJoin(packageDef.cwd, configFile);
    if (existsSync(fullPath) === true) {
      addFileReference(packageDef, fullPath);
    }
  });
});
