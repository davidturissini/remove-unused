import { readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { z } from 'zod';
import { Plugin } from './plugin.js';

export type FileDef = {
  type: 'ecmascript' | 'mdx';
  source: string;
};

const packageJsonSchema = z
  .object({
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
  packageJson: PackageJsonSchema;
  cwd: string;
  parentWorkspace: WorkspaceDefinition | null;
};

export interface WorkspaceDefinition extends PackageDefinition {
  packages: PackageDefinition[];
  files: Record<string, FileDef>;
}

const PACKAGE_JSON = 'package.json';

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

  const { parentWorkspace } = def;

  if (parentWorkspace === null) {
    return false;
  }

  return packageOrWorkspaceHasDependency(parentWorkspace, name);
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
