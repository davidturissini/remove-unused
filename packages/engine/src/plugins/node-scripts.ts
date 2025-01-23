import { join as pathJoin } from 'node:path';
import { createPlugin } from '../plugin.js';
import { addFileReference } from '../package.js';

export const plugin = createPlugin(({ packageDef }) => {
  const { packageJson, cwd } = packageDef;
  const { scripts: packageJsonScripts } = packageJson;
  if (packageJsonScripts === undefined) {
    return undefined;
  }

  Object.values(packageJsonScripts).forEach((command) => {
    const split = command.split(' ');
    if (split[0] === 'node') {
      const abs = pathJoin(cwd, split[1]);
      addFileReference(packageDef, abs);
    }
  });
});
