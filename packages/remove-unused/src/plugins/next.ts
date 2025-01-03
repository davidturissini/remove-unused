import { existsSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';
import { z } from 'zod';

const postCssConfigSchema = z.object({
  plugins: z.object({
    tailwindcss: z.object({
      config: z.string()
    }).optional(),
  }).optional()
});

const CONFIG_FILE_NAMES = [
  'next.config.js',
  'next.config.mjs'
]


export async function plugin({ packageJson, cwd, state }: { cwd: string, state: State, packageJson: PackageJsonSchema }): Promise<Plugin | undefined> {
  const { dependencies, devDependencies } = packageJson;
  if (dependencies?.next === undefined && devDependencies?.next === undefined) {
    return undefined;
  }
  
  const { scripts: packageJsonScripts } = packageJson;

  if (packageJsonScripts === undefined) {
    throw new Error('Next is listeed as dependency but no scripts are defined!');
  }

  // resolve which directory nextjs code is
  const nextJsScript = Object.values(packageJsonScripts).find((command) => {
    const split = command.split(' ');
    return split[0] === 'next';
  });

  if (nextJsScript === undefined) {
    throw new Error('Next is listeed as dependency but no Next scripts are defined!');
  }

  const hasConfiguredLocalDir = nextJsScript.split(' ')[2] !== undefined;
  const localNextDir = nextJsScript.split(' ')[2] ?? 'src';

  const absoluteDir = pathJoin(cwd, localNextDir);

  CONFIG_FILE_NAMES.forEach((configFile) => {
    const nextJsConfig = hasConfiguredLocalDir === true ? pathJoin(absoluteDir, configFile) : pathJoin(cwd, configFile);
    state.addRef(nextJsConfig);
  });

  const postCssConfigPath = pathJoin(absoluteDir, 'postcss.config.js');

  if (existsSync(postCssConfigPath) === true) {
    state.addRef(postCssConfigPath);
    const postCssConfig = state.require(postCssConfigPath);
    const parsed = postCssConfigSchema.safeParse(postCssConfig);
    if (parsed.success === true && parsed?.data?.plugins?.tailwindcss?.config !== undefined) {
      state.addRef(parsed.data.plugins.tailwindcss.config);
    }
  }

  return {
    name: 'next',
    fileBelongsTo(path) {
      return path.startsWith(
        pathJoin(absoluteDir, 'pages')
      )
    }
  }

}