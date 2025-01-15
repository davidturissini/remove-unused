import { join as pathJoin } from 'node:path';
import { createPlugin } from '../plugin.js';

export const plugin = createPlugin(
  ({ state, packageDef: { packageJson, cwd } }) => {
    const { dependencies, devDependencies } = packageJson;
    if (
      dependencies?.tailwindcss === undefined &&
      devDependencies?.tailwindcss === undefined
    ) {
      return undefined;
    }

    const config = pathJoin(cwd, 'tailwind.config.js');
    state.addRef(config);
  },
);
