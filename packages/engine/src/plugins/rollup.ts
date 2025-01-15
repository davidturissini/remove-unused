import { join as pathJoin } from 'node:path';
import type { State } from '../analyze.js';
import { packageOrWorkspaceHasDependency, eachScript } from '../package.js';
import { createPlugin } from '../plugin.js';

export const plugin = createPlugin(({ state, packageDef }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'rollup') === false) {
    return;
  }

  eachScript(packageDef, ({ command }) => {
    const split = command.split(' ');
    if (split[0] !== 'rollup') {
      return;
    }

    const configIndex = split.indexOf('-c');
    if (configIndex === -1) {
      return;
    }
    const config = split[configIndex + 1];

    if (config === undefined) {
      return;
    }

    const { cwd } = packageDef;
    const fullPath = pathJoin(cwd, config);
    state.addRef(fullPath);
  });
});
