import { join as pathJoin } from 'node:path';
import { createPlugin } from '../plugin.js';

export const plugin = createPlugin(({ state, packageDef }) => {
  const { packageJson, cwd } = packageDef;
  const { dependencies, devDependencies } = packageJson;
  if (
    dependencies?.postcss === undefined &&
    devDependencies?.postcss === undefined
  ) {
    return undefined;
  }

  const config = pathJoin(cwd, 'postcss.config.js');
  state.addRef(config);
});
