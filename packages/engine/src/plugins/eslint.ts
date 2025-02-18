import { existsSync } from 'node:fs';
import { createPlugin } from '../plugin.js';
import { join as pathJoin } from 'node:path';
import {
  addFileReference,
  packageOrWorkspaceHasDependency,
} from '../package.js';

const CONFIG_FILES = ['eslint.config.js', '.eslintrc.js', '.eslintrc.cjs'];

export const plugin = createPlugin(({ packageDef }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'eslint') === false) {
    return;
  }

  CONFIG_FILES.forEach((configFile) => {
    const fullPath = pathJoin(packageDef.cwd, configFile);
    if (existsSync(fullPath) === true) {
      addFileReference(packageDef, fullPath);
    }
  });
});
