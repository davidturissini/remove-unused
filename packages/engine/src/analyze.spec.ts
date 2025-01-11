import mock from 'mock-fs';
import { describe, expect, it, vi } from 'vitest';
import { parseFile, analyze } from './analyze.js';
import { readFileSync } from 'fs';

async function mockImport(path: string) {
  const contents = readFileSync(path).toString();
  return Promise.resolve({
    default: eval(contents)
  });
}

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
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([
        '/test/src/unused.ts'
      ]);
    });

    describe('unused ts file in node_modules', () => {
      it('should not report as unused', async () => {
        mock({
          '/test/node_modules/package/foo.ts': '// in node modules',
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "private": true,
            "dependencies": {}
          })
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
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
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([
        '/test/src/unused.js'
      ]);
    });
  });

  describe('Entrypoints', () => {
    describe('"main" field', () => {
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
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('"types" field', () => {
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
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('"exports"', () => {
      it('should not mark files in exports as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "exports": {
              ".": "./index.js",
            },
            "version": "0.0.1",
            "private": true,
            "dependencies": {}
          }),
          '/test/index.js': '//used!',
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });

      it('should not error when exports is nested map', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "exports": {
              ".": {
                "default": "./index.js",
              }
            },
            "version": "0.0.1",
            "private": true,
            "dependencies": {}
          }),
          '/test/index.js': '//used!',
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });

      it('should not error when exports is deeply nested map', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "exports": {
              ".": {
                "import": {
                  "default": "./index.js",
                }
              }
            },
            "version": "0.0.1",
            "private": true,
            "dependencies": {}
          }),
          '/test/index.js': '//used!',
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
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
          cwd: '/test',
          import: mockImport,
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
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('unresolved imports', () => {
    it('should mark resolved imports as used', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/index.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/src/index.ts': `
          import { foo } from 'somelibrary';
          import { bar } from './used';
        `,
        '/test/src/used.ts': '//unused'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('d.ts files', () => {
    describe('js file with d.ts file', () => {
      it('should not mark entry d.ts file as unused if tsconfig is present', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.js",
            "version": "0.0.1",
            "private": true,
            "dependencies": {},
            "scripts": {
              "dev": "next dev demo"
            },
          }),
          'tsconfig.json': {},
          '/test/src/main.js': `
            // js file
          `,
          '/test/src/main.d.ts': `
            // d ts file
          `,
        });
  
        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });
  
        expect(unusedFiles).toEqual([]);
      });

      it('should not mark imported d.ts file as unused if tsconfig is present', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.js",
            "version": "0.0.1",
            "private": true,
            "dependencies": {},
            "scripts": {
              "dev": "next dev demo"
            },
          }),
          'tsconfig.json': {},
          '/test/src/main.js': `
            export { foo } from './file.js';
          `,
          '/test/src/file.js': '',
          '/test/src/file.d.ts': `
            // d ts file
          `,
        });
  
        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });
  
        expect(unusedFiles).toEqual([]);
      });
    });
  });

  describe('Imports', () => {
    it('should not mark index.js files as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {},
          "scripts": {
            "dev": "next dev demo"
          },
        }),
        '/test/src/main.ts': `
          import { foo } from './folder';
        `,
        '/test/src/folder/index.ts': `// used`
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    });

    it('should not mark aliased imports that have index.js files as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "dependencies": {},
          "devDependencies": {
            "next": "1.2.2"
          },
          "scripts": {
            "dev": "next dev"
          },
        }),
        '/test/jsconfig.json': `
          {
            "compilerOptions": {
              "baseUrl": ".",
              "paths": {
                "@/*": ["src/*"]
              }
            }
          }
        `,
        '/test/next.config.js': `
          module.exports = {};
        `,
        '/test/src/components/Foo/index.ts': '// referenced via path alias',
        '/test/src/pages/Foo.tsx': `
            import Foo from '@/components/Foo'
        `
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    });

    it('should mark imports from config as used', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "scripts": {
            "dev": "next dev"
          },
          "dependencies": {
            next: '1.2.3'
          }
        }),
        '/test/next.config.mjs': `
          import { foo } from './file.mjs';
        `,
        '/test/file.mjs': '//used'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: async () => {
          return {
            default: {},
          }
        }
      });

      expect(unusedFiles).toEqual([]);
    });

    it('ignore ? from import statements', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "scripts": {
            "dev": "next dev"
          },
          "dependencies": {
            next: '1.2.3'
          }
        }),
        '/test/next.config.mjs': `
          import { foo } from './file.mjs?foo';
        `,
        '/test/file.mjs': '//used'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: async () => {
          return {
            default: {},
          }
        }
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('export statements', () => {
    it('should not mark files referenced in export statements as unused', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "main": "src/main.ts",
          "version": "0.0.1",
          "private": true,
          "dependencies": {},
          "scripts": {
            "dev": "next dev demo"
          },
        }),
        '/test/src/main.ts': `
          export { foo } from './file.ts';
        `,
        '/test/src/file.ts': `// used`
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',
        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    })
  });

  describe('Plugins', () => {
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

      it('should not mark jest.config.js files as unused', async () => {
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
          '/test/jest.config.js': '// used by jest'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });

      it('should not mark files from "testMatch" as unused', async () => {
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
          '/test/jest.config.js': `
            module.exports = ${
              JSON.stringify({
                testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
              })
            }
          `,
          '/test/foo.test.tsx': '// used',
          '/test/foo.test.ts': '// used'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('packageJson scripts', () => {
      it('should not mark node script files as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.ts",
            "version": "0.0.1",
            "private": true,
            "dependencies": {},
            "scripts": {
              "used": "node ./scripts/used.js"
            },
          }),
          '/test/scripts/used.js': '// used by jest'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('Next', () => {
      describe('non-root dir', () => {
        it('should not mark node script files as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev demo"
              },
            }),
            '/test/demo/next.config.js': 'module.exports = {}',
            '/test/demo/tailwind.config.js': '// used by postcss',
            '/test/demo/postcss.config.js': `
              module.exports = {
                plugins: {
                  tailwindcss: { config: '/test/demo/tailwind.config.js' },
                  autoprefixer: {},
                },
              }
            `,
            '/test/demo/pages/theme.js': '// used by next'
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });
      });

      describe('root dir', () => {
        it.each(['next.config.js', 'next.config.mjs'])('should not mark %s as unused', async (configFileName) => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev"
              },
            }),
            [`/test/${configFileName}`]: '// used by next'
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });

        describe('mjs config file', () => {
          it('should import the file', async () => {
            mock({
              '/test/package.json': JSON.stringify({
                "name": "unused-typescript-file",
                "main": "src/main.ts",
                "version": "0.0.1",
                "private": true,
                "dependencies": {},
                "devDependencies": {
                  "next": "1.2.2"
                },
                "scripts": {
                  "dev": "next dev"
                },
              }),
              '/test/next.config.mjs': '// used by next'
            });

            const importSpy = vi.fn();

            await analyze({
              cwd: '/test',
              import: importSpy,
            });

            expect(importSpy).toHaveBeenCalledWith('/test/next.config.mjs');

          })
        });
      });

      describe('MDX', () => {
        it('should not mark MDX files in pages dir as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev"
              },
            }),
            '/test/next.config.js': `
              module.exports = {
                pageExtensions: ['mdx'],
              }
            `,
            '/test/src/pages/Foo.mdx': '// presumably used by next?'
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',

            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });

        it('should not mark MDX files in pages dir as unused when config is mjs', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev"
              },
            }),
            '/test/next.config.mjs': `
              export default {
                pageExtensions: ['mdx'],
              }
            `,
            '/test/src/pages/Foo.mdx': `
import Foo from '@/components/Foo'

<Foo />
            `
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: async (path) => {
              if (path === '/test/next.config.mjs') {
                return {
                  default: {
                    pageExtensions: ['mdx'],
                  }
                }
              }
              throw new Error('Unexpected import');
            },
          });

          expect(unusedFiles).toEqual([]);

        })

        it('should mark files in pages dir as unused when pageExtensions does not contain mdx', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev"
              },
            }),
            '/test/next.config.js': `
              module.exports = {}
            `,
            '/test/src/pages/Foo.mdx': '// presumably used by next?'
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',

            import: mockImport,
          });

          expect(unusedFiles).toEqual([
            '/test/src/pages/Foo.mdx'
          ]);
        });

        it('should not mark component imported in MDX file as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "main": "src/main.ts",
              "version": "0.0.1",
              "private": true,
              "dependencies": {},
              "devDependencies": {
                "next": "1.2.2"
              },
              "scripts": {
                "dev": "next dev"
              },
            }),
            '/test/jsconfig.json': `
              {
                "compilerOptions": {
                  "baseUrl": ".",
                  "paths": {
                    "@/*": ["src/*"]
                  }
                }
              }
            `,
            '/test/next.config.js': `
              module.exports = {
                pageExtensions: ['mdx']
              };
            `,
            '/test/src/components/Foo.js': '// used by mdx',
            '/test/src/pages/Foo.mdx': `
import Foo from '@/components/Foo'

<Foo />
            `
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });
      });
    });

    describe('Tailwind', () => {
      it('should not mark tailwind.config.js files as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.ts",
            "version": "0.0.1",
            "devDependencies": {
              "tailwindcss": "^29.7.0",
            },
            "private": true,
            "dependencies": {}
          }),
          '/test/tailwind.config.js': '// used by jest'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test'
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('Prettier', () => {
      it('should not mark tailwind.config.js files as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "main": "src/main.ts",
            "version": "0.0.1",
            "devDependencies": {
              "prettier": "^29.7.0",
            },
            "private": true,
            "dependencies": {}
          }),
          '/test/prettier.config.js': '// used by jest'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test'
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('jsconfig.json', () => {
      describe('jsconfig.json paths', () => {
        it('should not report aliased JSX path as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "version": "0.0.1",
              "dependencies": {
                "next": "^29.7.0",
              },
              "scripts": {
                "dev": "next dev"
              },
              "private": true
            }),
            '/test/src/pages/index.js': `
              import Foo from '@/components/Foo';
            `,
            '/test/src/components/Foo.jsx': '// referenced via alias',
            '/test/next.config.js': `
              module.exports = {};
            `,
            '/test/jsconfig.json': `
              {
                "compilerOptions": {
                  "baseUrl": ".",
                  "paths": {
                    "@/*": ["src/*"]
                  }
                }
              }
            `
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });

        it('should not report aliased JS path as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "version": "0.0.1",
              "dependencies": {
                "next": "^29.7.0",
              },
              "scripts": {
                "dev": "next dev"
              },
              "private": true
            }),
            '/test/next.config.js': `
              module.exports = {}
            `,
            '/test/src/pages/index.js': `
              import Foo from '@/components/Foo';
            `,
            '/test/src/components/Foo.js': '// referenced via alias',
            '/test/jsconfig.json': `
              {
                "compilerOptions": {
                  "baseUrl": ".",
                  "paths": {
                    "@/*": ["src/*"]
                  }
                }
              }
            `
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });

        it('should not report files referenced alongside lib imports as unused', async () => {
          mock({
            '/test/package.json': JSON.stringify({
              "name": "unused-typescript-file",
              "version": "0.0.1",
              "dependencies": {
                "next": "^29.7.0",
              },
              "scripts": {
                "dev": "next dev"
              },
              "private": true
            }),
            '/test/src/pages/index.js': `
              import Foo from 'somelib';
              import Foo from '@/components/Foo';
            `,
            '/test/src/components/Foo.jsx': '// referenced via alias',
            '/test/next.config.js': `
              module.exports = {};
            `,
            '/test/jsconfig.json': `
              {
                "compilerOptions": {
                  "baseUrl": ".",
                  "paths": {
                    "@/*": ["src/*"]
                  }
                }
              }
            `
          });

          const { unusedFiles } = await analyze({
            cwd: '/test',
            import: mockImport,
          });

          expect(unusedFiles).toEqual([]);
        });
      });
    });

    describe('eslint', () => {
      it('should not mark eslint.config.js as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "dependencies": {
              "eslint": "0.0.0"
            },
            "private": true
          }),
          '/test/eslint.config.js': '// eslint config'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('postcss', () => {
      it('should not mark postcss.config.js as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "dependencies": {
              "postcss": "0.0.0"
            },
            "private": true
          }),
          '/test/postcss.config.js': `//postcss config`
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });

    describe('bnt', () => {
      it('should not mark foo.test.js as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "dependencies": {
              "better-node-test": "0.0.0"
            },
            "private": true
          }),
          '/test/foo.test.js': '// test file'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });

      it('should not mark foo.test.ts as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "dependencies": {
              "better-node-test": "0.0.0"
            },
            "private": true
          }),
          '/test/foo.test.ts': '// test file'
        });

        const { unusedFiles } = await analyze({
          cwd: '/test',
          import: mockImport,
        });

        expect(unusedFiles).toEqual([]);
      });
    });
  });

  describe('node_modules', () => {
    it('should not include any files from node_modules', async () => {
      mock({
        '/test/package.json': JSON.stringify({
          "name": "unused-typescript-file",
          "version": "0.0.1",
          "private": true,
          "dependencies": {}
        }),
        '/test/node_modules/package/file.ts': '// in node modules'
      });

      const { unusedFiles } = await analyze({
        cwd: '/test',

        import: mockImport,
      });

      expect(unusedFiles).toEqual([]);
    });
  });

  describe('monorepo', () => {
    describe('package.json workspaces', () => {
      it('should not mark child package entry as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "private": true,
            "dependencies": {},
            "workspaces": [
              "packages/foo"
            ],
          }),
          '/test/packages/foo/package.json': JSON.stringify({
            "name": "child",
            "version": "0.0.1",
            "private": true,
            "main": "index.js",
            "dependencies": {},
          }),
          '/test/packages/foo/index.js': '// main file for package'
        });
  
        const { unusedFiles } = await analyze({
          cwd: '/test',
  
          import: mockImport,
        });
  
        expect(unusedFiles).toEqual([]);
      });
    });

    describe('hoisted dependencies', () => {
      it('should not report used config file from hoisted dependency as unused', async () => {
        mock({
          '/test/package.json': JSON.stringify({
            "name": "unused-typescript-file",
            "version": "0.0.1",
            "private": true,
            "dependencies": {
              "jest": "0.0.0"
            },
            "workspaces": [
              "packages/foo"
            ],
          }),
          '/test/packages/foo/package.json': JSON.stringify({
            "name": "child",
            "version": "0.0.1",
            "private": true,
            "main": "index.js",
            "dependencies": {},
          }),
          '/test/packages/foo/jest.config.js': '// main file for package'
        });
  
        const { unusedFiles } = await analyze({
          cwd: '/test',
  
          import: mockImport,
        });
  
        expect(unusedFiles).toEqual([]);
      })
    });
  });

});

describe('parseFile', () => {
  it('should support typescript', () => {
    expect(() => {
      parseFile('foo.ts', {
        type: 'ecmascript',
        source: `
        type Foo = { prop: string };
        const foo: Foo = { prop: 'asd' };  
      `})
    }).not.toThrow();
  });

  it('should support decorators', () => {
    expect(() => {
      parseFile('foo.ts', {
        type: 'ecmascript',
        source: `
          @Component({ })
          class Foo {}
        `
      })
    }).not.toThrow();
  });

  it('should support decoratorsBeforeExport', () => {
    expect(() => {
      parseFile('foo.js', {
        type: 'ecmascript',
        source: `
        import { Component } from '@angular/core'

        @Component({
          selector: 'app-nav',
          template: \`
            <nav class="py-4 px-6 text-sm font-medium">
              <ul class="flex space-x-3">
                <ng-content></ng-content>
              </ul>
            </nav>
          \`,
        })

        export class NavComponent {}

      `})
    }).not.toThrow();
  });

  it('should support TSX', () => {
    expect(() => {
      parseFile('foo.tsx', {
        type: 'ecmascript',
        source: `
        type Foo = { prop: string };
        const foo: Foo = { prop: 'asd' };  

        function ok () {
          return (
            <div>Hi</div>
          );
        }
      `})
    }).not.toThrow();
  });

  it('should support JSX', () => {
    expect(() => {
      parseFile('foo.jsx', {
        type: 'ecmascript',
        source: `
        function ok () {
          return (
            <div>Hi</div>
          );
        }
      `})
    }).not.toThrow();
  });

  it('should support MDX', () => {
    expect(() => {
      parseFile('foo.mdx', {
        type: 'mdx',
        source: `
---
title: Front matter
---

import { Foo } from 'somewhere';

<div>Some JSX</div>
      `})
    }).not.toThrow();
  })
});