const pluginJs = require('@eslint/js');
const tseslint = require('typescript-eslint');
const eslintPluginAstro = require('eslint-plugin-astro');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/dist/*', '**/.astro/*'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs['flat/recommended'],
  ...eslintPluginAstro.configs['jsx-a11y-strict'],
];
