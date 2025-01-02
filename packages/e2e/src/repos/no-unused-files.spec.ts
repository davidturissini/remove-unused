import { join as pathJoin } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { describe, it, expect } from 'vitest';
import { analyze } from 'remove-unused';

function getRepoPath(name: string) {
  return pathJoin(workspaceRoot, 'test-repos', name);
}

const repoPath = getRepoPath('no-unused-files');

describe('No unused files', () => {
  it('should report no unused files', async () => {
    const { unusedFiles } = await analyze({
      cwd: repoPath,
    });

    expect(unusedFiles).toEqual([]);
  });
});