import { existsSync, readFileSync, statSync } from 'node:fs';
import { join as pathJoin, extname, dirname } from 'node:path';
import {
  ModuleItem,
  parseSync,
  type Module as SwcModule,
  type CallExpression,
  type Expression,
  type ImportDeclaration,
  ExportNamedDeclaration,
} from '@swc/core';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { globSync } from 'glob';

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
import {
  type PackageDefinition,
  readPackageJson,
  type WorkspaceDefinition,
} from './package.js';
import type { Plugin, PathResolver } from './plugin.js';

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
] as const satisfies Plugin[];

type Params = {
  cwd: string;
  import?: (path: string) => Promise<unknown>;
};

export type State = {
  import(path: string): Promise<unknown>;
  resolvePath(path: string): string | undefined;
  addResolver(resolver: PathResolver): void;
  isReferenced(path: string): boolean;
  addRef(path: string): void;
  isLibraryFile(path: string): boolean;
};

type FileDef = {
  type: 'ecmascript' | 'mdx';
  source: string;
};

function parsePackage({
  parentWorkspace,
  cwd,
}: {
  parentWorkspace: WorkspaceDefinition | null;
  cwd: string;
}): PackageDefinition {
  const packageJson = readPackageJson({ cwd });

  return {
    cwd,
    packageJson,
    parentWorkspace,
  };
}

async function parseWorkspace({
  cwd,
}: {
  cwd: string;
  state: State;
}): Promise<WorkspaceDefinition> {
  const packageJson = readPackageJson({ cwd });
  const typescriptFiles = globSync(
    pathJoin(cwd, '**/*.{js,ts,jsx,tsx,mjs,cjs}'),
    {
      ignore: pathJoin(cwd, '**/node_modules/**'),
    },
  );

  const mdxFiles = globSync(pathJoin(cwd, '**/*.mdx'), {
    ignore: pathJoin(cwd, '**/node_modules/**'),
  });

  const files: WorkspaceDefinition['files'] = {};

  mdxFiles.forEach((filePath) => {
    files[filePath] = {
      type: 'mdx',
      source: readFileSync(filePath).toString(),
    };
  });

  typescriptFiles.forEach((filePath) => {
    if (statSync(filePath).isDirectory() === true) {
      return;
    }
    files[filePath] = {
      type: 'ecmascript',
      source: readFileSync(filePath).toString(),
    };
  });

  const { workspaces } = packageJson;

  const packages: PackageDefinition[] = [];
  const workspace: WorkspaceDefinition = {
    packages,
    packageJson,
    cwd,
    files,
    moduleType: packageJson.type === undefined ? 'commonjs' : packageJson.type,
    parentWorkspace: null,
  };

  const fullPaths = workspaces.map((pathGlob) => {
    return pathJoin(cwd, pathGlob);
  });

  for (const packagePath of fullPaths) {
    packages.push(
      parsePackage({
        cwd: packagePath,
        parentWorkspace: workspace,
      }),
    );
  }

  return workspace;
}

function walk(
  exp: ModuleItem | Expression,
  visitor: {
    require: (exp: CallExpression) => void;
    exportStatement: (exp: ExportNamedDeclaration) => void;
    importStatement: (exp: ImportDeclaration) => void;
  },
) {
  switch (exp.type) {
    case 'ImportDeclaration': {
      visitor.importStatement(exp);
      break;
    }
    case 'ExportNamedDeclaration': {
      visitor.exportStatement(exp);
      break;
    }
    case 'VariableDeclaration': {
      const { declarations } = exp;
      declarations.forEach((decl) => {
        const { init } = decl;
        if (init !== undefined) {
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
  let normalized: string = pathJoin(
    sourceDirectory,
    `${noQueryParam.replace(extension, '')}${extension}`,
  );

  // An import with no extension
  if (extension === '') {
    // check if there is an index file
    for (const indexFileName of ['index.ts', 'index.js', 'index.mjs']) {
      const indexFilePath = pathJoin(
        sourceDirectory,
        noQueryParam,
        indexFileName,
      );
      if (existsSync(indexFilePath)) {
        return indexFilePath;
      }
    }

    const normalizedWithExtension = IMPORT_EXTENSIONS.map((ext) => {
      const path = `${noQueryParam.replace(ext, '')}${ext}`;
      return pathJoin(sourceDirectory, path);
    }).find((absPath) => {
      return existsSync(absPath);
    });

    if (normalizedWithExtension !== undefined) {
      normalized = normalizedWithExtension;
    }
  }

  return normalized;
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
            importStatements.push(resolvedFilePath);
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
            importStatements.push(resolvedFilePath);
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
          throw new Error('dynamic require() statement');
        }

        const argValue = firstArgument.expression.value;
        const extension = extname(argValue) || '.js';
        staticRequireStatements.push(
          pathJoin(dirname(sourceFilePath), `${argValue}${extension}`),
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

async function walkFiles(
  { files: packageFiles }: Pick<WorkspaceDefinition, 'files'>,
  state: State,
) {
  const filePaths = Object.keys(packageFiles) as Array<
    keyof typeof packageFiles
  >;
  filePaths.forEach((path) => {
    if (
      state.isReferenced(path) === false &&
      state.isLibraryFile(path) === true
    ) {
      state.addRef(path);
    }

    try {
      const ast = parseFile(path, packageFiles[path]);
      const { importStatements, static: staticRequireExpressions } =
        collectFileReferences(path, ast, state);

      [...importStatements, ...staticRequireExpressions].forEach((path) => {
        state.addRef(path);
        const extName = extname(path);
        if (extName === '.js' && existsSync(path.replace('.js', '.d.ts'))) {
          state.addRef(path.replace('.js', '.d.ts'));
        }
      });
    } catch {
      // noop
    }
  });
}

export async function analyze({ cwd, import: importParam }: Params) {
  const usedFiles: Record<string, true> = {};
  const resolvers: PathResolver[] = [];
  const plugins: Plugin[] = [];
  const state: State = {
    async import(path) {
      return await importFile({
        path,
        moduleType: workspaceDef.moduleType,
        import: importParam,
      });
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
    isReferenced(path) {
      return usedFiles[path] === true;
    },
    isLibraryFile(path) {
      for (const plugin of plugins) {
        if (plugin.fileBelongsTo?.(path) === true) {
          return true;
        }
      }
      return false;
    },
    addRef(path) {
      usedFiles[path] = true;
    },
  };

  const workspaceDef = await parseWorkspace({ cwd, state });
  const { files: sourceFiles } = workspaceDef;

  const flatPackages = [workspaceDef, ...workspaceDef.packages];
  for (const packageDef of flatPackages) {
    for (const createPlugin of pluginsRegistry) {
      const plugin = await createPlugin({ packageDef, state });
      if (plugin === undefined) {
        continue;
      }
      plugins.push(plugin);
    }
  }

  await walkFiles(workspaceDef, state);

  const unusedFiles = Object.keys(sourceFiles).filter(
    (path: keyof typeof sourceFiles) => {
      return usedFiles[path] === undefined;
    },
  );

  return {
    unusedFiles,
  };
}
