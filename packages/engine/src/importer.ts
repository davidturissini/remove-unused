import { require as tsRequire } from 'tsx/cjs/api';
import { tsImport } from 'tsx/esm/api';
import { extname } from 'node:path';

export type RequireFn = typeof tsRequire;
export type ImportFn = typeof tsImport;

type Params = {
  path: string;
  moduleType: 'module' | 'commonjs';
  require?: (path: string) => unknown;
  import?: ImportFn;
};

export async function importFile({
  path,
  moduleType,
  require: requireParam,
  import: importParam,
}: Params) {
  const importFn = importParam === undefined ? tsImport : importParam;
  const requireFn = requireParam === undefined ? tsRequire : requireParam;

  const extName = extname(path);
  switch (extName) {
    case '.mjs':
    case '.js':
    case '.ts': {
      if (moduleType === 'module') {
        return await importFn(path, './');
      }

      return requireFn(path, './');
    }
  }

  throw new Error(`Cannot import unknown file extension "${extName}"`);
}
