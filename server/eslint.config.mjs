// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Flat ESLint config for the Flat Town API.
 *
 * `tsc --noEmit` owns type correctness; this config only enforces the
 * correctness rules that survive type erasure (unused values, accidental
 * fallthrough, floating promises are handled by the type system already).
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'uploads/**',
      'coverage/**',
      'src/seed/**',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-return-await': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Tests intentionally assert on loosely typed JSON envelopes.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
