import { readFileSync } from 'node:fs';
import { join as pathJoin, extname, dirname } from 'node:path';
import { ModuleItem, parseSync, type Module as SwcModule, type CallExpression, type Expression, type ImportDeclaration } from '@swc/core';
import { z } from 'zod';
import { globSync } from 'glob';
import { plugin as jestPlugin } from './plugins/jest.js';
import { plugin as packageJsonScriptsPlugin } from './plugins/node-scripts.js';
import { plugin as nextPlugin } from './plugins/next.js';
import { plugin as prettierPlugin } from './plugins/prettier.js';
import { plugin as tailwindPlugin } from './plugins/tailwind.js';
import { plugin as jsConfigPlugin } from './plugins/jsconfig.js';
import { plugin as packageJsonPlugin } from './plugins/package-json.js';

type Params = {
  cwd: string;
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
  resolvePath(path: string): (string | undefined);
  addResolver(resolver: PathResolver): void;
  require(path: string): unknown;
  isReferenced(path: string): boolean;
  addRef(path: string): void;
  isLibraryFile(path: string): boolean;
}

export type Plugin = {
  name: string;
  fileBelongsTo?(path: string): boolean;
  resolver?(importPath: string): string;
}

type PackageDefinition = {
  packageJson: PackageJsonSchema;
  files: Record<string, string>;
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
] as const;

async function parsePackage({ cwd, state }: { cwd: string, state: State }): Promise<PackageDefinition> {
  const packageJson = readPackageJson({ cwd });
  const plugins: Plugin[] = [];
  const typescriptFiles = globSync(
    pathJoin(cwd, '**/*.{js,ts,jsx,tsx}'),
    {
      ignore: ['**/node_modules/**']
    }
  );

  for (const createPlugin of pluginsRegistry) {
    const plugin = await createPlugin({ cwd, packageJson, state });
    if (plugin === undefined) {
      continue;
    }
    plugins.push(plugin);
  }

  return {
    plugins,
    packageJson,
    files: typescriptFiles.reduce((acc, filePath) => {
      acc[filePath] = readFileSync(filePath).toString();
      return acc;
    }, {} as PackageDefinition['files'])
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

function resolveRequireStatements(sourceFilePath: string, ast: SwcModule, state: State) {
  const staticRequireStatements: string[] = [];
  const importStatements: string[] = [];

  ast.body.forEach((body) => {
    walk(body, {
      importStatement: (importStatement) => {
        if (importStatement.source.type === 'StringLiteral') {
          const resolved = state.resolvePath(importStatement.source.value);
          if (resolved === undefined) {
            throw new Error(`Unable to resolve path: ${importStatement.source.value}`);
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

export function parseFile(fileName: string, contents: string) {
  const ext = extname(fileName);
  return parseSync(contents, {
    syntax: (ext === '.ts' || ext === '.tsx') ? 'typescript' : 'ecmascript',
    decorators: true,
    decoratorsBeforeExport: true,
    tsx: true,
    jsx: true,
  });
}

async function walkFiles({ files: packageFiles }: Pick<PackageDefinition, 'files'>, state: State) {
  const filePaths = Object.keys(packageFiles) as Array<keyof typeof packageFiles>;
  filePaths.forEach((path) => {
    if (state.isReferenced(path) === false && state.isLibraryFile(path) === true) {
      state.addRef(path);
    }

    try {
      const ast = parseFile(path, packageFiles[path]);
      const { importStatements, static: staticRequireExpressions } = resolveRequireStatements(path, ast, state);
      [...importStatements, ...staticRequireExpressions].forEach((path) => state.addRef(path));
    } catch { }
  });
}


export async function analyze({ cwd, require: requireParam = require }: Params) {
  const usedFiles: Record<string, true> = {};
  const resolvers: PathResolver[] = [];
  const state: State = {
    resolvePath: (path: string) => {
      for(const plugin of plugins) {
        const resolved = plugin?.resolver?.(path);
        if (resolved !== undefined) {
          return resolved;
        }
      }
    },
    addResolver: (resolver: PathResolver) => {
      resolvers.push(resolver);
    },
    require: requireParam,
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