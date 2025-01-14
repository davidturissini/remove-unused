import { existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { z } from 'zod';
import { createPlugin } from '../plugin.js';
import { packageOrWorkspaceHasDependency } from '../package.js';

const viteConfigSchema = z.object({
  test: z.object({
    setupFiles: z.array(z.string()).optional(),
  }).optional()
});

const viteConfigModuleSchema = z.object({
  default: z.object({
    default: viteConfigSchema.optional()
  })
})

export const plugin = createPlugin(async ({ packageDef, state }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'vitest') === false) {
    return;
  }

  const { cwd } = packageDef;
  const configFile = pathJoin(cwd, 'vite.config.ts');
  if (existsSync(configFile) === true) {
    state.addRef(configFile);

    const config = await state.import(configFile);
    const parsedConfig = viteConfigModuleSchema.safeParse(config);
    console.log('config', config)
    if (parsedConfig.success === true) {
      const setupFiles = parsedConfig.data.default.default?.test?.setupFiles || [];
      setupFiles.forEach((path) => {
        const fullPath = pathJoin(cwd, path);
        state.addRef(fullPath);
      })
    }
  }
  

  return {
    name: 'vitest',
    fileBelongsTo(path) {
      return new RegExp('test.ts').test(path);
    },
  }

})
