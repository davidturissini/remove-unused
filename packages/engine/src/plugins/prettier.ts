import { join as pathJoin } from 'node:path';
import type { State } from '../analyze.js';
import { createPlugin } from '../plugin.js';

export const plugin = createPlugin(
  ({ state, packageDef: { packageJson, cwd } }) => {
    const { dependencies, devDependencies } = packageJson;
    if (
      dependencies?.prettier === undefined &&
      devDependencies?.prettier === undefined
    ) {
      return undefined;
    }

    const config = pathJoin(cwd, 'prettier.config.js');
    state.addRef(config);
  },
);
