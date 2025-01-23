import { join as pathJoin } from 'node:path';
import {
  packageOrWorkspaceHasDependency,
  eachScript,
  addFileReference,
} from '../package.js';
import { createPlugin } from '../plugin.js';
import { z } from 'zod';

const rollupConfigSchema = z.object({
  input: z.array(z.string()),
});
const rollupConfigImportSchema = z.object({
  default: z
    .union([z.array(rollupConfigSchema), rollupConfigSchema])
    .optional(),
});

function findConfigIndex(split: string[]) {
  const cIndex = split.indexOf('-c');
  if (cIndex > -1) {
    return cIndex + 1;
  }

  const configIndex = split.indexOf('--config');
  if (configIndex > -1) {
    return configIndex + 1;
  }
}

export const plugin = createPlugin(async ({ state, packageDef }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'rollup') === false) {
    return;
  }

  const configFilePaths: string[] = [];
  const { cwd } = packageDef;
  eachScript(packageDef, ({ command }) => {
    const split = command.split(' ');
    if (split[0] !== 'rollup') {
      return;
    }

    const configIndex = findConfigIndex(split);
    if (configIndex === undefined) {
      return;
    }
    const config = split[configIndex];

    if (config === undefined) {
      return;
    }

    const fullPath = pathJoin(cwd, config);
    addFileReference(packageDef, fullPath);
    configFilePaths.push(fullPath);
  });

  for (const configFilePath of configFilePaths) {
    const loadedConfig = await state.import(configFilePath);
    const parsed = rollupConfigImportSchema.safeParse(loadedConfig);
    if (parsed.success === false) {
      return;
    }

    const { default: rollupConfig } = parsed.data;
    if (Array.isArray(rollupConfig)) {
      rollupConfig.forEach(({ input }) => {
        input.forEach((inputPath) => {
          const fullPath = pathJoin(cwd, inputPath);
          addFileReference(packageDef, fullPath);
        });
      });
    }
  }
});
