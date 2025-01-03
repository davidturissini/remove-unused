import { join as pathJoin } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { describe, it, expect } from 'vitest';
import { analyze } from 'remove-unused';

function getRepoPath(name: string) {
  return pathJoin(workspaceRoot, 'test-repos', name);
}

describe('no-unused-files', () => {
  const repoPath = getRepoPath('no-unused-files');
  it('should report no unused files', async () => {
    const { unusedFiles } = await analyze({
      cwd: repoPath,
    });

    expect(unusedFiles).toEqual([]);
  });
});

describe('unused-typescript-file', () => {
  const repoPath = getRepoPath('unused-typescript-file');
  it('should report "unused.ts" as unused', async () => {
    const { unusedFiles } = await analyze({
      cwd: repoPath,
    });

    expect(unusedFiles).toEqual([
      pathJoin(repoPath, 'src', 'unused.ts')
    ]);
  });
});