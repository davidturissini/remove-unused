import { existsSync, readFileSync, statSync } from 'node:fs';
import { join as pathJoin, basename, extname, dirname } from 'node:path';
import { ModuleItem, parseSync, type Module as SwcModule, type CallExpression, type Expression, type ImportDeclaration } from '@swc/core';
import { z } from 'zod';
import { remark } from 'remark'
import remarkMdx from 'remark-mdx'
import { globSync } from 'glob';
import { plugin as jestPlugin } from './plugins/jest.js';
import { plugin as packageJsonScriptsPlugin } from './plugins/node-scripts.js';
import { plugin as nextPlugin } from './plugins/next.js';
import { plugin as prettierPlugin } from './plugins/prettier.js';
import { plugin as tailwindPlugin } from './plugins/tailwind.js';
import { plugin as jsConfigPlugin } from './plugins/jsconfig.js';
import { plugin as postcssPlugin } from './plugins/postcss.js';
import { plugin as packageJsonPlugin } from './plugins/package-json.js';

type Params = {
  cwd: string;
  import?: (path: string) => Promise<unknown>;
  require?: (path: string) => unknown;
}

const packageJsonSchema = z.object({
  main: z.string().optional(),
  types: z.string().optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
}).passthrough();

export type PackageJsonSchema = z.infer<typeof packageJsonSchema>;

type PathResolver = (aliasOrPath: string) => (string | undefined);

export type State = {
  import(path: string): Promise<unknown>
  resolvePath(path: string): (string | undefined);
  addResolver(resolver: PathResolver): void;
  isReferenced(path: string): boolean;
  addRef(path: string): void;
  isLibraryFile(path: string): boolean;
}

export type Plugin = {
  name: string;
  fileBelongsTo?(path: string): boolean;
  resolver?: PathResolver;
}

type FileDef = {
  type: 'ecmascript' | 'mdx';
  source: string
}

type PackageDefinition = {
  packageJson: PackageJsonSchema;
  files: Record<string, FileDef>;
  plugins: Plugin[];
}

const PACKAGE_JSON = 'package.json';

function readPackageJson({ cwd }: Pick<Params, 'cwd'>) {
  const contents = readFileSync(
    pathJoin(cwd, PACKAGE_JSON)
  ).toString();
  return packageJsonSchema.parse(JSON.parse(contents));
}

const pluginsRegistry = [
  jestPlugin,
  packageJsonScriptsPlugin,
  nextPlugin,
  tailwindPlugin,
  prettierPlugin,
  jsConfigPlugin,
  packageJsonPlugin,
  postcssPlugin,
] as const;

async function parsePackage({ cwd, state }: { cwd: string, state: State }): Promise<PackageDefinition> {
  const packageJson = readPackageJson({ cwd });
  const plugins: Plugin[] = [];
  const typescriptFiles = globSync(
    pathJoin(cwd, '**/*.{js,ts,jsx,tsx,mjs,cjs}'),
    {
      ignore: pathJoin(cwd, '**/node_modules/**')
    }
  );

  const mdxFiles = globSync(
    pathJoin(cwd, '**/*.mdx'),
    {
      ignore: pathJoin(cwd, '**/node_modules/**')
    }
  );

  for (const createPlugin of pluginsRegistry) {
    const plugin = await createPlugin({ cwd, packageJson, state });
    if (plugin === undefined) {
      continue;
    }
    plugins.push(plugin);
  }

  const files: PackageDefinition['files'] = {};

  mdxFiles.forEach((filePath) => {
    files[filePath] = {
      type: 'mdx',
      source: readFileSync(filePath).toString()
    };
  })

  typescriptFiles.forEach((filePath) => {
    if (statSync(filePath).isDirectory() === true) {
      return;
    }
    files[filePath] = {
      type: 'ecmascript',
      source: readFileSync(filePath).toString()
    };
  })

  return {
    plugins,
    packageJson,
    files,
  };
}

function walk(exp: ModuleItem | Expression, visitor: {
  require: (exp: CallExpression) => void;
  importStatement: (exp: ImportDeclaration) => void;
}) {
  switch (exp.type) {
    case 'ImportDeclaration': {
      visitor.importStatement(exp);
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
  let normalized: string = pathJoin(sourceDirectory, `${noQueryParam.replace(extension, '')}${extension}`);

  // An import with no extension
  if (extension === '') {
    // check if there is an index file
    for(const indexFileName of ['index.ts', 'index.js', 'index.mjs']) {
      const indexFilePath = pathJoin(sourceDirectory, noQueryParam, indexFileName);
      if (existsSync(indexFilePath)) {
        return indexFilePath;
      }
    }

    const normalizedWithExtension = IMPORT_EXTENSIONS.map((ext) => {
      const path = `${noQueryParam.replace(ext, '')}${ext}`;
      return pathJoin(sourceDirectory, path);
    }).find((absPath) => {
      return existsSync(absPath);
    })
    
    if (normalizedWithExtension !== undefined) {
      normalized = normalizedWithExtension;
    }
  }
  
  return normalized;
}

function resolveRequireStatements(sourceFilePath: string, ast: SwcModule, state: State) {
  const staticRequireStatements: string[] = [];
  const importStatements: string[] = [];

  ast.body.forEach((body) => {
    walk(body, {
      importStatement: (importStatement) => {
        if (importStatement.source.type === 'StringLiteral') {
          const resolved = state.resolvePath(importStatement.source.value);
          if (resolved === undefined) {
            const resolvedFilePath = resolveImportPath(dirname(sourceFilePath), importStatement.source.value);
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
          pathJoin(
            dirname(sourceFilePath),
            `${argValue}${extension}`
          )
        );
      }
    });
  });

  return {
    importStatements,
    static: staticRequireStatements,
  }
}

type AstDef = ReturnType<typeof parseFile>;

export function parseFile(fileName: string, file: FileDef) {
  const ext = extname(fileName);
  switch (file.type) {
    case 'ecmascript': {
      return {
        type: 'ecmascript',
        ast: parseSync(file.source, {
          syntax: (ext === '.ts' || ext === '.tsx') ? 'typescript' : 'ecmascript',
          decorators: true,
          decoratorsBeforeExport: true,
          tsx: true,
          jsx: true,
        })
      } as const;
    }
    case 'mdx': {
      return {
        type: 'mdx',
        ast: remark()
          .use(remarkMdx)
          .parse(file.source)
      } as const;
    }
  }


}

function resolveMdxImportStatements(sourceFilePath: string, ast: AstDef, state: State) {
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
          throw new Error(`Import source "${item.source.value}" is not a string`)
        }

        const { value: importSource } = item.source;
        const resolved = state.resolvePath(importSource);
          if (resolved === undefined) {
            const extension = extname(importSource) || '.ts';
            importStatements.push(
              pathJoin(
                dirname(sourceFilePath),
                `${importSource}${extension}`
              )
            );
            return;
          }
          importStatements.push(resolved);
      }
    })

  });

  return {
    static: [],
    importStatements,
  }
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

async function walkFiles({ files: packageFiles }: Pick<PackageDefinition, 'files'>, state: State) {
  const filePaths = Object.keys(packageFiles) as Array<keyof typeof packageFiles>;
  filePaths.forEach((path) => {
    if (state.isReferenced(path) === false && state.isLibraryFile(path) === true) {
      state.addRef(path);
    }

    try {
      const ast = parseFile(path, packageFiles[path]);
      const { importStatements, static: staticRequireExpressions } = collectFileReferences(path, ast, state);


      [...importStatements, ...staticRequireExpressions].forEach((path) => state.addRef(path));
    } catch { }
  });
}


export async function analyze({ cwd, import: importParam }: Params) {
  const usedFiles: Record<string, true> = {};
  const resolvers: PathResolver[] = [];
  const state: State = {
    async import(path) {
      if (importParam !== undefined) {
        return await importParam(path);
      }

      return await import(path);
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
  }

  const packageDef = await parsePackage({ cwd, state });
  const {
    plugins,
    files: sourceFiles,
  } = packageDef;

  await walkFiles(packageDef, state);

  const unusedFiles = Object.keys(sourceFiles).filter((path: keyof typeof sourceFiles) => {
    return usedFiles[path] === undefined;
  });

  return {
    unusedFiles,
  }
}