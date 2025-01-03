import mock from 'mock-fs';
import { describe, expect, it } from 'vitest';
import { parseFile, analyze } from './analyze.js';

describe('analyze', () => {
  describe('unused ts file', () => {
    it('should report unused file', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/unused.ts': '//unused'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([
        '/test/src/unused.ts'
      ]);
    });
  });

  describe('unused js file', () => {
    it('should report unused file', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/unused.js': '//unused'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([
        '/test/src/unused.js'
      ]);
    });
  });

  describe('Entrypoint from "main" field', () => {
    it('should not report as unused file', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/main.ts': '//used!'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('Entrypoint from "types" field', () => {
    it('should not report as unused file', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "types": "src/types.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/main.ts': '//used!',
        '/test/src/types.ts': '//used!'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('Static require statement', () => {
    describe('top level', () => {
      it('should not report as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.ts",
            "version": "0.0.1",
            "private": true,
            "dependencies": {}
          }),
          '/test/src/main.ts': 'require("./utils")',
          '/test/src/utils.js': '//used!'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test'
        });

        expect(unusedFiles).toEqual([]);
      });
    });
  });

  describe('assignment', () => {
    it('should not report as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/main.ts': 'const foo = require("./utils")',
        '/test/src/utils.js': '//used!'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('Jest', () => {
    it('should not mark .test.js files as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "devDependencies": {
            "jest": "^29.7.0",
          },
          "private": true,
          "dependencies": {}
        }),
        '/test/src/used.test.js': '// used by jest'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([]);
    });

    it('should not mark "setupFilesAfterEnv" files as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "devDependencies": {
            "jest": "^29.7.0",
          },
          "private": true,
          "dependencies": {},
          "jest": {
            "setupFilesAfterEnv": [
              "<rootDir>/jest/customMatchers.js"
            ]
          }
        }),
        '/test/jest/customMatchers.js': '// used by jest'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test'
      });

      expect(unusedFiles).toEqual([]);
    });
  });
});

describe('parseFile', () => {
  it('should support typescript', () => {
    expect(() => {
      parseFile('foo.ts', `
        type Foo = { prop: string };
        const foo: Foo = { prop: 'asd' };  
      `)
    }).not.toThrow();
  });

  it('should support TSX', () => {
    expect(() => {
      parseFile('foo.tsx', `
        type Foo = { prop: string };
        const foo: Foo = { prop: 'asd' };  

        function ok () {
          return (
            <div>Hi</div>
          );
        }
      `)
    }).not.toThrow();
  });

  it('should support JSX', () => {
    expect(() => {
      parseFile('foo.jsx', `
        function ok () {
          return (
            <div>Hi</div>
          );
        }
      `)
    }).not.toThrow();
  });
});