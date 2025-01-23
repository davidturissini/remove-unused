import { readFileSync, statSync } from 'node:fs';
import { join as pathJoin, extname } from 'node:path';
import { z } from 'zod';

export function createFileDef(filePath: string) {
  const extName = extname(filePath);
  switch (extName) {
    case '.mdx': {
      return {
        type: 'mdx',
        source: readFileSync(filePath).toString(),
      } as const;
    }
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
    case '.mjs':
    case '.cjs': {
      if (statSync(filePath).isDirectory() === true) {
        return;
      }
      return {
        type: 'ecmascript',
        source: readFileSync(filePath).toString(),
      } as const;
    }
  }
}

export type FileDef = {
  type: 'ecmascript' | 'mdx';
  source: string;
};

const packageJsonSchema = z
  .object({
    name: z.string(),
    type: z.literal('module').optional(),
    main: z.string().optional(),
    types: z.string().optional(),
    exports: z
      .record(
        z.string(),
        z.union([
          z.record(z.union([z.string(), z.record(z.string())])),
          z.string(),
        ]),
      )
      .optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    workspaces: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export type PackageJsonSchema = z.infer<typeof packageJsonSchema>;

export type PackageDefinition = {
  name: string;
  moduleType: 'commonjs' | 'module';
  packageJson: PackageJsonSchema;
  cwd: string;
  files: Record<string, FileDef>;
  referencedFiles: Record<string, true>;
  workspaces: PackageDefinition[];
  parent: PackageDefinition | null;
};

const PACKAGE_JSON = 'package.json';

function packageContainsFile(def: PackageDefinition, filePath: string) {
  const { cwd } = def;
  return filePath.startsWith(cwd);
}

export function collectAllFiles(def: PackageDefinition) {
  const childWorkspaceFiles = def.workspaces.map((child) => {
    return Object.keys(child.files);
  });
  return [...Object.keys(def.files), ...childWorkspaceFiles];
}

export async function parsePackage({
  parent,
  allWorkspaceFiles,
  cwd,
}: {
  allWorkspaceFiles: string[];
  parent: PackageDefinition | null;
  cwd: string;
}): Promise<PackageDefinition> {
  const packageJson = readPackageJson({ cwd });
  const files: PackageDefinition['files'] = {};
  const packageWorkspaces: PackageDefinition['workspaces'] = [];

  const packageDefinition: PackageDefinition = {
    name: packageJson.name,
    cwd,
    referencedFiles: {},
    workspaces: packageWorkspaces,
    moduleType: packageJson.type === undefined ? 'commonjs' : packageJson.type,
    files,
    packageJson,
    parent,
  };

  const { workspaces: packageJsonWorkspaces } = packageJson;
  for (const workspacePath of packageJsonWorkspaces) {
    const packageCwd = pathJoin(cwd, workspacePath);
    packageWorkspaces.push(
      await parsePackage({
        parent: packageDefinition,
        cwd: packageCwd,
        allWorkspaceFiles,
      }),
    );
  }

  allWorkspaceFiles.forEach((filePath) => {
    // file is outside this directory, does not belong to this package
    if (packageContainsFile(packageDefinition, filePath) === false) {
      return;
    }

    // check if any children packages have claimed it
    let claimed: boolean = false;
    for (const childWorkspace of packageWorkspaces) {
      if (childWorkspace.files[filePath] !== undefined) {
        claimed = true;
      }
    }

    if (claimed === true) {
      return;
    }

    const def = createFileDef(filePath);
    if (def === undefined) {
      return;
    }
    files[filePath] = def;
  });

  return packageDefinition;
}

export function addFileReference(def: PackageDefinition, filePath: string) {
  if (def.files[filePath] === undefined) {
    // external file being referenced, just bail
    return;
  }

  def.referencedFiles[filePath] = true;
}

export function isPackageFile(def: PackageDefinition, path: string) {
  return def.files[path] !== undefined;
}

export function getUnusedFileReferences(def: PackageDefinition) {
  const { files, referencedFiles } = def;
  return Object.keys(files).filter((filePath) => {
    return referencedFiles[filePath] !== true;
  });
}

export function readPackageJson({ cwd }: { cwd: string }) {
  const contents = readFileSync(pathJoin(cwd, PACKAGE_JSON)).toString();
  return packageJsonSchema.parse(JSON.parse(contents));
}

export function packageHasDependency(def: PackageDefinition, name: string) {
  const { packageJson } = def;
  const { dependencies, devDependencies } = packageJson;
  return (
    dependencies?.[name] !== undefined || devDependencies?.[name] !== undefined
  );
}

export function packageOrWorkspaceHasDependency(
  def: PackageDefinition,
  name: string,
) {
  if (packageHasDependency(def, name) === true) {
    return true;
  }

  const { parent } = def;
  if (parent === null) {
    return false;
  }

  return packageOrWorkspaceHasDependency(parent, name);
}

export function eachScript(
  { packageJson }: PackageDefinition,
  cb: (data: { name: string; command: string }) => void,
) {
  const { scripts } = packageJson;
  if (scripts === undefined) {
    return;
  }

  Object.keys(scripts).forEach((scriptName) => {
    cb({
      name: scriptName,
      command: scripts[scriptName],
    });
  });
}
