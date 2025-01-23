import { join as pathJoin } from 'node:path';
import { createPlugin } from '../plugin.js';
import { addFileReference } from '../package.js';

export const plugin = createPlugin(({ packageDef }) => {
  const { packageJson, cwd } = packageDef;
  const { dependencies, devDependencies } = packageJson;
  if (
    dependencies?.tailwindcss === undefined &&
    devDependencies?.tailwindcss === undefined
  ) {
    return undefined;
  }

  const config = pathJoin(cwd, 'tailwind.config.js');
  addFileReference(packageDef, config);
});
