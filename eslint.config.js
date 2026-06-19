import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const tsUnused = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
};

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'packages/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser widget source (TypeScript).
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: tsUnused,
  },
  {
    // Vitest tests (TypeScript) — jsdom environment + node.
    files: ['test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: tsUnused,
  },
  {
    // Build / deploy / secrets scripts — Node ESM (plain JS tooling).
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
