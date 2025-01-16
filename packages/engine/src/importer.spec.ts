import { describe, expect, it, vi } from 'vitest';
import { importFile, type ImportFn, type RequireFn } from './importer.js';

describe('cjs', () => {
  it('should use require to import TS files', async () => {
    const requireSpy = vi.fn();
    await importFile({
      path: '/path/to/file.ts',
      moduleType: 'commonjs',
      require: requireSpy as unknown as RequireFn,
    });

    expect(requireSpy).toHaveBeenCalled();
  });
});

describe('mjs', () => {
  it('should use require to import TS files', async () => {
    const importSpy = vi.fn();
    await importFile({
      path: '/path/to/file.ts',
      moduleType: 'module',
      import: importSpy as unknown as ImportFn,
    });

    expect(importSpy).toHaveBeenCalled();
  });
});
