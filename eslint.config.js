import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^(req|res|next|_)',
          varsIgnorePattern: '^(React|_)',
        },
      ],
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', '**/node_modules/**', 'client/dist/**', '**/dist/**'],
  },
];
