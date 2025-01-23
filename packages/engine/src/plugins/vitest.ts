import { existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { z } from 'zod';
import { createPlugin } from '../plugin.js';
import {
  addFileReference,
  packageOrWorkspaceHasDependency,
} from '../package.js';

const CONFIG_FILES = ['vite.config.ts', 'vitest.config.ts'];

const viteConfigSchema = z.object({
  test: z
    .object({
      setupFiles: z.array(z.string()).optional(),
    })
    .optional(),
});

const viteConfigModuleSchema = z.union([
  z.object({
    default: z.object({
      default: viteConfigSchema,
    }),
  }),
  z.object({
    default: viteConfigSchema,
  }),
]);

type VitestConfig = z.infer<typeof viteConfigSchema>;

function getVitestConfig(
  imported: z.infer<typeof viteConfigModuleSchema>,
): VitestConfig | undefined {
  if ('default' in imported.default) {
    return imported.default.default;
  }
  return imported.default;
}

export const plugin = createPlugin(async ({ packageDef, state }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'vitest') === false) {
    return;
  }

  const { cwd } = packageDef;

  for (const filePath of CONFIG_FILES) {
    const configFile = pathJoin(cwd, filePath);
    if (existsSync(configFile) === true) {
      addFileReference(packageDef, configFile);

      const config = await state.import(configFile);
      const parsedConfig = viteConfigModuleSchema.safeParse(config);

      if (parsedConfig.success === true) {
        const vitestConfig = getVitestConfig(parsedConfig.data);
        const setupFiles = vitestConfig?.test?.setupFiles;
        setupFiles?.forEach((path) => {
          const fullPath = pathJoin(cwd, path);
          addFileReference(packageDef, fullPath);
        });
      }
    }
  }

  return {
    name: 'vitest',
    fileBelongsTo(path) {
      return new RegExp('test.ts').test(path);
    },
  };
});
