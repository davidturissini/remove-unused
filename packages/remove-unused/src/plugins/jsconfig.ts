import { existsSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { Plugin, PackageJsonSchema, State } from '../analyze.js';
import { z } from 'zod';
import { createMatchPath } from 'tsconfig-paths';

const jsConfigSchema = z.object({
  compilerOptions: z.union([
    z.object({
      baseUrl: z.string(),
      paths: z.record(z.string(), z.array(z.string())),
    }),
    z.object({
      baseUrl: z.never(),
      paths: z.never(),
    }),
  ])
});

const EXTENSIONS = [
  '.jsx',
  '.js',
  '.ts',
  '.tsx'
]

export async function plugin({ cwd, state }: { cwd: string, state: State }): Promise<Plugin | undefined> {
  const jsConfigFilePath = pathJoin(cwd, 'jsconfig.json');
  if (existsSync(jsConfigFilePath) === false) {
    return;
  }

  const jsConfig = jsConfigSchema.parse(JSON.parse(readFileSync(jsConfigFilePath).toString()));
  const paths = jsConfig.compilerOptions?.paths;
  
  if (paths === undefined) {
    return;
  }

  const { baseUrl } = jsConfig.compilerOptions;
  const matchPathFn = createMatchPath(pathJoin(cwd, baseUrl), paths);

  return {
    name: 'jsconfig',
    resolver: (importPath) => {
      const resolved = matchPathFn(importPath, undefined, undefined, EXTENSIONS);

      if (resolved === undefined) {
        return undefined;
      }

      for(const ext of EXTENSIONS) {
        const path = `${resolved}${ext}`;
        if (existsSync(path) === true) {
          return path;
        }
        
        const withIndex = pathJoin(resolved, `index${ext}`);
        if (existsSync(withIndex) === true) {
          return withIndex;
        }
      }
  
      return undefined;
    }
  }
}