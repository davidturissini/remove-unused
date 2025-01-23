import { z } from 'zod';
import { join as pathJoin } from 'node:path';
import type { State } from '../analyze.js';
import { globSync } from 'glob';
import { existsSync } from 'node:fs';
import {
  addFileReference,
  type PackageDefinition,
  packageOrWorkspaceHasDependency,
} from '../package.js';
import { createPlugin } from '../plugin.js';

const jestConfigSchema = z.object({
  setupFilesAfterEnv: z.array(z.string()).optional(),
  testMatch: z.array(z.string()).optional(),
});

const packageJsonJestSchema = z.object({
  jest: jestConfigSchema.optional(),
});

const jestSchemaImported = z.object({
  default: jestConfigSchema,
});

async function loadConfig(
  { packageJson, cwd }: PackageDefinition,
  state: State,
) {
  const parsed = packageJsonJestSchema.parse(packageJson);
  if (parsed.jest !== undefined) {
    return parsed.jest;
  }

  const configFile = pathJoin(cwd, 'jest.config.js');

  if (existsSync(configFile) === false) {
    return;
  }

  const config = await state.import(configFile);
  const parsedImportedConfig = jestSchemaImported.safeParse(config);
  if (parsedImportedConfig.success === false) {
    return;
  }

  return parsedImportedConfig.data.default;
}

export const plugin = createPlugin(async ({ state, packageDef }) => {
  if (packageOrWorkspaceHasDependency(packageDef, 'jest') === false) {
    return;
  }

  const { cwd } = packageDef;

  const config = await loadConfig(packageDef, state);
  config?.setupFilesAfterEnv?.forEach((path) => {
    const absolute = path.replace('<rootDir>', cwd);
    addFileReference(packageDef, absolute);
  });

  const configPath = pathJoin(cwd, 'jest.config.js');
  if (existsSync(configPath)) {
    addFileReference(packageDef, configPath);
  }
  const allFiles =
    config?.testMatch?.reduce((acc, match) => {
      const expanded = match.replace('<rootDir>', cwd);
      const files = globSync(expanded, {
        ignore: '**/node_modules/**',
      });

      return [...acc, ...files];
    }, [] as string[]) || [];

  return {
    name: 'jest',
    fileBelongsTo: function fileBelongsTo(path: string) {
      if (config?.testMatch === undefined) {
        const fileMatch = new RegExp('.test.js');
        return fileMatch.test(path);
      }

      return allFiles.includes(path);
    },
  };
});
