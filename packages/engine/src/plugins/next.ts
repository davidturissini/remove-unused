import { existsSync } from 'node:fs';
import { join as pathJoin, extname } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';
import { z } from 'zod';

const postCssConfigSchema = z.object({
  default: z.object({
    plugins: z.object({
      tailwindcss: z.object({
        config: z.string()
      }).optional(),
    }).optional()
  }).optional(),
});

const nextJsConfigSchema = z.object({
  pageExtensions: z.array(z.string()).default(['jsx', 'js', 'tsx', 'ts'])
});

const nextJsConfigSchemaImported = z.object({
  default: nextJsConfigSchema.optional(),
});

const CONFIG_FILE_NAMES = [
  'next.config.js',
  'next.config.mjs'
]

async function importNextJsConfig(absPath: string, state: State) {
  const value = await state.import(absPath);
  if (value === undefined) {
    return;
  }
  return nextJsConfigSchemaImported.parse(value).default
}

async function loadConfig(cwd: string, state: State) {
  for(const fileName of CONFIG_FILE_NAMES) {
    const absPath = pathJoin(cwd, fileName);
    if (existsSync(absPath)) {
      state.addRef(absPath);
      const contents = await importNextJsConfig(absPath, state);
      const parsed = nextJsConfigSchema.safeParse(contents);
      if (parsed.success === false) {
        continue;
      }
      return {
        fileName: absPath, 
        config: parsed.data,
      }
    }
  }
}

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
  const config = await loadConfig(hasConfiguredLocalDir === true ? absoluteDir : cwd, state);
  if (config) {
    state.addRef(config.fileName);
  }

  const postCssConfigPath = pathJoin(absoluteDir, 'postcss.config.js');

  if (existsSync(postCssConfigPath) === true) {
    state.addRef(postCssConfigPath);
    const postCssConfig = await state.import(postCssConfigPath);
    const parsed = postCssConfigSchema.safeParse(postCssConfig);
    if (parsed.success === true && parsed?.data?.default?.plugins?.tailwindcss?.config !== undefined) {
      state.addRef(parsed.data.default.plugins.tailwindcss.config);
    }
  }

  return {
    name: 'next',
    fileBelongsTo(path) {
      const inPagesDir = path.startsWith(
        pathJoin(absoluteDir, 'pages')
      );

      if (inPagesDir === false) {
        return false;
      }

      const extension = extname(path).replace('.', '');
      return config?.config.pageExtensions.includes(extension) === true;
    }
  }

}