const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/',
      '**/dist/',
      '**/generated/',
      'build/',
      'coverage/',
      'docs/',
      '**/prisma.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Type-checked Regeln nur für TS/TSX (benötigen parserOptions.project)
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  prettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // no-unsafe-* vorerst nur Warnung, bis API-Response-Typen etc. ergänzt sind
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['apps/frontend/src/pages/**/*.tsx'],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['apps/backend/src/domains/**/routes/**/*.ts'],
    rules: {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        exports: 'writable',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['apps/frontend/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // In Tests: res.json() liefert typisch unknown/any; Type-Assertions sind nötig für no-unsafe-*
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'max-lines': ['warn', { max: 700, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  }
);
