import { createPlugin } from '../plugin.js';
import { packageHasDependency } from '../package.js';

export const plugin = createPlugin(({ packageDef }) => {
  if (packageHasDependency(packageDef, 'better-node-test') === false) {
    return;
  }

  return {
    name: 'better-node-test',
    fileBelongsTo(path) {
      return /\.test\.(js|ts)/.test(path);
    }
  }
})
