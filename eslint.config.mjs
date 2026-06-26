// ESLint flat config (ESLint 9). Lints the TypeScript extension host and the
// Svelte 5 webview. Formatting is owned by Prettier (`npm run format`) — the
// `prettier` config below switches off every rule that would fight it, so
// ESLint stays focused on correctness/quality, not whitespace.
//
// Run: `npm run lint` (autofix: `npm run lint:fix`).
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  // Don't lint build output, deps, generated files, or the static docs site.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      'bin/**',
      // Vite build output: bundles land directly under webview/ (index.js,
      // sidebar.js, history.js + hashed chunks). Source lives in webview/src/.
      'webview/*.js',
      'webview/dist/**',
      'webview/assets/**',
      'documentation/**',
      'extension/src/generated/**',
      'playwright-report/**',
      'test-results/**',
      '*.config.{js,cjs,mjs,ts}',
    ],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // The 4 surviving `any`s are at VS Code API boundaries — keep them
      // visible (warn) rather than silently allowed.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow intentionally-unused args/vars prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // console.warn/error are legitimate (Output Channel fallback); plain
      // console.log should not ship.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Svelte components are parsed by svelte-eslint-parser; <script lang="ts">
  // blocks are handed to the TS parser. The webview is Svelte 5 (runes), which
  // ESLint's base rules predate — these overrides keep the gate honest without
  // fighting framework idiom:
  //   • `$state`/`$props` legitimately use `let` → prefer-const must be off.
  //   • `$:` / `$effect` read as "unused expressions" to ESLint → off.
  //   • compiler a11y hints (svelte/valid-compile) are real but a 17k-LOC
  //     retrofit; surfaced as warnings (non-blocking) to ratchet down later.
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      'prefer-const': 'off',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'svelte/valid-compile': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
    },
  },

  // Tests and Playwright specs are allowed to be looser: empty fixture
  // destructuring (`async ({}, use) =>`), empty catch blocks, dynamic require,
  // and ts-comments are normal in test scaffolding.
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  // Must come LAST: disables all formatting rules so Prettier wins.
  prettier,
);
