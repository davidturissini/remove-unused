import { dirname } from 'node:path';
import { createPlugin } from '../plugin.js';
import { packageOrWorkspaceHasDependency } from '../package.js';

export const plugin = createPlugin(({ packageDef }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'mocha') === false) {
    return;
  }

  return {
    name: 'mocha',
    fileBelongsTo(path) {
      return /test/.test(dirname(path));
    },
  };
});
