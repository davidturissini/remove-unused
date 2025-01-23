import { existsSync } from 'node:fs';
import { join as pathJoin, extname, dirname } from 'node:path';
import {
  ModuleItem,
  parseSync,
  type Module as SwcModule,
  type CallExpression,
  type Expression,
  type ImportDeclaration,
  type ExportNamedDeclaration,
  type ExportAllDeclaration,
} from '@swc/core';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import resolve from 'resolve';

import { importFile } from './importer.js';
import { plugin as bntPlugin } from './plugins/bnt.js';
import { plugin as eslintPlugin } from './plugins/eslint.js';
import { plugin as jestPlugin } from './plugins/jest.js';
import { plugin as packageJsonScriptsPlugin } from './plugins/node-scripts.js';
import { plugin as nextPlugin } from './plugins/next.js';
import { plugin as prettierPlugin } from './plugins/prettier.js';
import { plugin as tailwindPlugin } from './plugins/tailwind.js';
import { plugin as jsConfigPlugin } from './plugins/jsconfig.js';
import { plugin as postcssPlugin } from './plugins/postcss.js';
import { plugin as rollupPlugin } from './plugins/rollup.js';
import { plugin as packageJsonPlugin } from './plugins/package-json.js';
import { plugin as vitestPlugin } from './plugins/vitest.js';
import { plugin as sizeLimitPlugin } from './plugins/size-limit.js';

import { parseWorkspace } from './workspace.js';
import type { Plugin, PathResolver } from './plugin.js';
import {
  addFileReference,
  getUnusedFileReferences,
  PackageDefinition,
} from './package.js';

const pluginsRegistry = [
  vitestPlugin,
  jestPlugin,
  packageJsonScriptsPlugin,
  nextPlugin,
  tailwindPlugin,
  prettierPlugin,
  jsConfigPlugin,
  packageJsonPlugin,
  postcssPlugin,
  eslintPlugin,
  bntPlugin,
  rollupPlugin,
  sizeLimitPlugin,
] as const satisfies Plugin[];

type Params = {
  cwd: string;
  packages?: string[];
  import?: (path: string) => Promise<unknown>;
};

export type State = {
  filteredPackages: Record<string, true>;
  import(path: string): Promise<unknown>;
  resolvePath(path: string): string | undefined;
  addResolver(resolver: PathResolver): void;
  isLibraryFile(path: string): boolean;
};

type FileDef = {
  type: 'ecmascript' | 'mdx';
  source: string;
};

function walk(
  exp: ModuleItem | Expression,
  visitor: {
    require: (exp: CallExpression) => void;
    exportStatement: (
      exp: ExportNamedDeclaration | ExportAllDeclaration,
    ) => void;
    importStatement: (exp: ImportDeclaration) => void;
  },
) {
  switch (exp.type) {
    case 'ImportDeclaration': {
      visitor.importStatement(exp);
      break;
    }
    case 'ExportAllDeclaration':
    case 'ExportNamedDeclaration': {
      visitor.exportStatement(exp);
      break;
    }
    case 'VariableDeclaration': {
      const { declarations } = exp;
      declarations.forEach((decl) => {
        const { init } = decl;
        if (init !== undefined && init !== null) {
          walk(init, visitor);
        }
      });
      break;
    }
    case 'ExpressionStatement': {
      walk(exp.expression, visitor);
      break;
    }
    case 'CallExpression': {
      if (exp.callee.type === 'Identifier' && exp.callee.value === 'require') {
        visitor.require(exp);
      }
    }
  }
}

const IMPORT_EXTENSIONS = ['.ts', '.js', '.mjs', '.tsx', '.jsx'];

function resolveImportPath(sourceDirectory: string, importPath: string) {
  const noQueryParam = importPath.split('?')[0];
  const extension = extname(noQueryParam);
  const normalized: string = `${noQueryParam.replace(extension, '')}${extension}`;

  try {
    return resolve.sync(normalized, {
      extensions: IMPORT_EXTENSIONS,
      basedir: sourceDirectory,
    });
  } catch {
    // ignore, probably trying to resolve a library
    return;
  }
}

function resolveRequireStatements(
  sourceFilePath: string,
  ast: SwcModule,
  state: State,
) {
  const staticRequireStatements: string[] = [];
  const importStatements: string[] = [];

  ast.body.forEach((body) => {
    walk(body, {
      exportStatement: (exportStatement) => {
        if (exportStatement.source?.type === 'StringLiteral') {
          const resolved = state.resolvePath(exportStatement.source.value);
          if (resolved === undefined) {
            const resolvedFilePath = resolveImportPath(
              dirname(sourceFilePath),
              exportStatement.source.value,
            );
            if (resolvedFilePath !== undefined) {
              importStatements.push(resolvedFilePath);
            }
            return;
          }
          importStatements.push(resolved);
        }
      },
      importStatement: (importStatement) => {
        if (importStatement.source.type === 'StringLiteral') {
          const resolved = state.resolvePath(importStatement.source.value);
          if (resolved === undefined) {
            const resolvedFilePath = resolveImportPath(
              dirname(sourceFilePath),
              importStatement.source.value,
            );
            if (resolvedFilePath !== undefined) {
              importStatements.push(resolvedFilePath);
            }
            return;
          }
          importStatements.push(resolved);
        }
      },
      require: (requireExpression) => {
        const { arguments: requireArguments } = requireExpression;
        if (requireArguments.length > 1) {
          throw new Error('require() statement with multiple arguments');
        }

        const firstArgument = requireExpression.arguments[0];

        if (firstArgument.expression.type !== 'StringLiteral') {
          throw new Error(`dynamic require() statement: "${sourceFilePath}"`);
        }

        const argValue = firstArgument.expression.value;
        const extension = extname(argValue) || '.js';
        staticRequireStatements.push(
          pathJoin(
            dirname(sourceFilePath),
            `${argValue.replace(extension, '')}${extension}`,
          ),
        );
      },
    });
  });

  return {
    importStatements,
    static: staticRequireStatements,
  };
}

type AstDef = ReturnType<typeof parseFile>;

export function parseFile(fileName: string, file: FileDef) {
  const ext = extname(fileName);
  switch (file.type) {
    case 'ecmascript': {
      return {
        type: 'ecmascript',
        ast: parseSync(file.source, {
          syntax: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
          decorators: true,
          decoratorsBeforeExport: true,
          tsx: true,
          jsx: true,
        }),
      } as const;
    }
    case 'mdx': {
      return {
        type: 'mdx',
        ast: remark().use(remarkMdx).parse(file.source),
      } as const;
    }
  }
}

function resolveMdxImportStatements(
  sourceFilePath: string,
  ast: AstDef,
  state: State,
) {
  if (ast.ast.type !== 'root') {
    throw new Error('Invalid top level MDX ast');
  }

  const importStatements: string[] = [];
  const { children } = ast.ast;

  children.forEach((child) => {
    if (child.type !== 'mdxjsEsm') {
      return;
    }

    const { data } = child;

    if (data === undefined) {
      return;
    }

    const { estree } = data;

    estree?.body.forEach((item) => {
      if (item.type === 'ImportDeclaration') {
        if (typeof item.source.value !== 'string') {
          throw new Error(
            `Import source "${item.source.value}" is not a string`,
          );
        }

        const { value: importSource } = item.source;
        const resolved = state.resolvePath(importSource);
        if (resolved === undefined) {
          const extension = extname(importSource) || '.ts';
          importStatements.push(
            pathJoin(dirname(sourceFilePath), `${importSource}${extension}`),
          );
          return;
        }
        importStatements.push(resolved);
      }
    });
  });

  return {
    static: [],
    importStatements,
  };
}

function collectFileReferences(path: string, ast: AstDef, state: State) {
  switch (ast.type) {
    case 'ecmascript': {
      return resolveRequireStatements(path, ast.ast, state);
    }
    case 'mdx': {
      return resolveMdxImportStatements(path, ast, state);
    }
  }
}

async function walkFiles(packageDef: PackageDefinition, state: State) {
  const { files: packageFiles } = packageDef;

  const filePaths = Object.keys(packageFiles) as Array<
    keyof typeof packageFiles
  >;
  filePaths.forEach((path) => {
    if (state.isLibraryFile(path) === true) {
      addFileReference(packageDef, path);
    }

    try {
      const ast = parseFile(path, packageFiles[path]);
      const { importStatements, static: staticRequireExpressions } =
        collectFileReferences(path, ast, state);

      [...importStatements, ...staticRequireExpressions].forEach((path) => {
        addFileReference(packageDef, path);
        const extName = extname(path);
        if (extName === '.js' && existsSync(path.replace('.js', '.d.ts'))) {
          addFileReference(packageDef, path.replace('.js', '.d.ts'));
        }
      });
    } catch (e) {
      if (/dynamic require/.test(`${e}`)) {
        return;
      }
      console.log(`Error when analyzing "${path}"`);
      throw e;
      // noop
    }
  });
}

export async function analyze({
  cwd,
  import: importParam,
  packages: packageFilter = [],
}: Params) {
  const resolvers: PathResolver[] = [];
  const plugins: Plugin[] = [];
  const filteredPackages = packageFilter.reduce(
    (acc, packageName) => {
      acc[packageName] = true;
      return acc;
    },
    {} as Record<string, true>,
  );
  const state: State = {
    filteredPackages,
    async import(path) {
      try {
        return await importFile({
          path,
          moduleType: workspaceDef.moduleType,
          import: importParam,
        });
      } catch (e) {
        process.stdout.write(`Error trying to import "${path}": ${e}`);
        process.stdout.write('\n');
        return;
      }
    },
    resolvePath: (path: string) => {
      for (const plugin of plugins) {
        const resolved = plugin?.resolver?.(path);
        if (resolved !== undefined) {
          return resolved;
        }
      }
    },
    addResolver: (resolver: PathResolver) => {
      resolvers.push(resolver);
    },
    isLibraryFile(path) {
      for (const plugin of plugins) {
        if (plugin.fileBelongsTo?.(path) === true) {
          return true;
        }
      }
      return false;
    },
  };

  const workspaceDef = await parseWorkspace({
    cwd,
    state,
  });

  const allPackages = [workspaceDef, ...workspaceDef.workspaces];
  const analyzePackages =
    packageFilter.length === 0
      ? allPackages
      : allPackages.filter(({ name: packageName }) => {
          return filteredPackages[packageName] === true;
        });

  const packages: Array<{
    name: string;
    unusedFiles: string[];
  }> = [];

  for (const packageDef of analyzePackages) {
    const unusedFiles: string[] = [];
    for (const createPlugin of pluginsRegistry) {
      const plugin = await createPlugin({ packageDef, state });
      if (plugin === undefined) {
        continue;
      }
      plugins.push(plugin);
    }
    await walkFiles(packageDef, state);
    getUnusedFileReferences(packageDef).forEach((filePath) => {
      unusedFiles.push(filePath);
    });

    packages.push({
      name: packageDef.name,
      unusedFiles,
    });
  }

  return {
    packages,
  };
}
