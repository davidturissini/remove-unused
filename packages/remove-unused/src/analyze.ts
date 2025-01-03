import { readFileSync } from 'node:fs';
import { join as pathJoin, extname, dirname } from 'node:path';
import { ModuleItem, parseSync, type Module as SwcModule, type CallExpression, Expression } from '@swc/core';
import { z } from 'zod';
import { globSync } from 'glob';
import { plugin as jestPlugin } from './plugins/jest.js';
import { plugin as packageJsonScriptsPlugin } from './plugins/node-scripts.js';
import { plugin as nextPlugin } from './plugins/next.js';

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

export type State = {
  require(path: string): unknown;
  isReferenced(path: string): boolean;
  addRef(path: string): void;
  isLibraryFile(path: string): boolean;
}

export type Plugin = {
  name: string;
  fileBelongsTo(path: string): boolean;
}

type PackageDefinition = {
  packageJson: PackageJsonSchema;
  entryPoints: Record<string, true>;
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

function getPackageEntryPoints(cwd: string, packageJson: PackageJsonSchema) {
  const { main, types } = packageJson;
  const entryPoints: Record<string, true> = {};

  [
    main, types
  ].forEach((filePath) => {
    if (filePath !== undefined) {
      entryPoints[
        pathJoin(cwd, filePath)
      ] = true;
    }
  });
  
  return entryPoints;
}

const pluginsRegistry = [
  jestPlugin,
  packageJsonScriptsPlugin,
  nextPlugin,
] as const;

async function parsePackage({ cwd, state }: { cwd: string, state: State }): Promise<PackageDefinition> {
  const packageJson = readPackageJson({ cwd });
  const plugins: Plugin[] = [];
  const typescriptFiles = globSync(
    pathJoin(cwd, '**/*.{js,ts}'),
    {
      ignore: ['**/node_modules/**']
    }
  );

  for(const createPlugin of pluginsRegistry) {
    const plugin = await createPlugin({ cwd, packageJson, state });
    if (plugin === undefined) {
      continue;
    }
    plugins.push(plugin);
  }

  return {
    plugins,
    packageJson,
    entryPoints: getPackageEntryPoints(cwd, packageJson),
    files: typescriptFiles.reduce((acc, filePath) => {
      acc[filePath] = readFileSync(filePath).toString();
      return acc;
    }, {} as PackageDefinition['files'])
  };
}

function walk(exp: ModuleItem | Expression, visitor: {
  require: (exp: CallExpression) => void;
}) {
  switch(exp.type) {
    case 'VariableDeclaration': {
      const { declarations } = exp;
      declarations.forEach((decl) => {
        const { init } =decl;
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

function resolveRequireStatements(sourceFilePath: string, ast: SwcModule) {
  const staticRequireStatements: string[] = [];

  ast.body.forEach((body) => {
    walk(body, {
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
        const extension =  extname(argValue) || '.js';
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
    static: staticRequireStatements,
  }
}

export function parseFile(fileName: string, contents: string) {
  const ext = extname(fileName);
  return parseSync(contents, {
    syntax: (ext === '.ts' || ext === '.tsx') ? 'typescript' : 'ecmascript',
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

    const ast = parseFile(path, packageFiles[path]);
    const { static: staticRequireExpressions } = resolveRequireStatements(path, ast);
    staticRequireExpressions.forEach((path) => state.addRef(path));
  });
}


export async function analyze({ cwd, require: requireParam = require }: Params) {
  const usedFiles: Record<string, true> = {};
  const state: State = {
    require: requireParam,
    isReferenced(path) {
      return usedFiles[path] === true;
    },
    isLibraryFile(path) {
      for (const plugin of plugins) {
        if (plugin.fileBelongsTo(path) === true) {
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
    entryPoints: packageEntrypoints,
  } = packageDef;
  
  Object.keys(packageEntrypoints).forEach((key) => {
    state.addRef(key);
  });


  await walkFiles(packageDef, state);

  const unusedFiles = Object.keys(sourceFiles).filter((path: keyof typeof sourceFiles) => {
    return usedFiles[path] === undefined;
  });
  
  return {
    unusedFiles,
  }
}