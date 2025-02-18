import { join as pathJoin } from 'node:path';
import { type PackageDefinition, parsePackage } from './package.js';
import ignoreWalk from 'ignore-walk';

export async function parseWorkspace({
  cwd,
}: {
  cwd: string;
}): Promise<PackageDefinition> {
  const allWorkspaceFiles = (
    await ignoreWalk({
      path: cwd,
      ignoreFiles: ['.gitignore'],
      includeEmpty: true,
    })
  ).map((path) => {
    return pathJoin(cwd, path);
  });

  const packageDef = await parsePackage({
    parent: null,
    cwd,
    allWorkspaceFiles,
  });

  return packageDef;
}
