import { existsSync } from 'node:fs';
import { createPlugin } from '../plugin.js';
import { join as pathJoin } from 'node:path';
import { packageHasDependency } from '../package.js';

export const plugin = createPlugin(({ packageDef, state }) => {
  if (packageHasDependency(packageDef, 'eslint') === false) {
    return;
  }

  const configFile = 'eslint.config.js';
  const fullPath = pathJoin(packageDef.cwd, configFile);
  if (existsSync(fullPath) === true) {
    state.addRef(fullPath);
  }
});
