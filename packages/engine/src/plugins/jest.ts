import { z } from 'zod';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';

const jestConfigSchema = z.object({
  setupFilesAfterEnv: z.array(
    z.string(),
  ).optional(),
})

const packageJsonJestSchema = z.object({
  jest: jestConfigSchema,
})

async function loadConfig({ packageJson }: { packageJson: unknown }) {
  const parsed = packageJsonJestSchema.safeParse(packageJson);
  if (parsed.success === false) {
    return;
  }

  return parsed.data.jest;
}

async function jest({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: unknown }): Promise<Plugin> {
  const config = await loadConfig({ packageJson });
  const fileMatch = new RegExp('.test.js');
  config?.setupFilesAfterEnv?.forEach((path) => {
    const absolute = path.replace('<rootDir>', cwd);
    state.addRef(absolute);
  })

  return {
      name: 'jest',
      fileBelongsTo: function fileBelongsTo(path: string) {
        return fileMatch.test(path);
      },
  }
}

export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }) {
  if (packageJson.dependencies?.jest !== undefined || packageJson.devDependencies?.jest !== undefined) {
    return await jest({ packageJson, state, cwd });
  }
}