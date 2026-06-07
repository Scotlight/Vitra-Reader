const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh').default;

function toWarningRule(ruleValue) {
  if (ruleValue === 'off' || ruleValue === 0) {
    return ruleValue;
  }
  if (Array.isArray(ruleValue)) {
    if (ruleValue[0] === 'off' || ruleValue[0] === 0) {
      return ruleValue;
    }
    return ['warn', ...ruleValue.slice(1)];
  }
  return 'warn';
}

const warnRecommendedRules = Object.fromEntries(
  Object.entries(tsPlugin.configs.recommended.rules ?? {}).map(([ruleName, ruleValue]) => [
    ruleName,
    toWarningRule(ruleValue),
  ]),
);

module.exports = [
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'release/**',
      'extracted/**',
      'bug/**',
      'logs/**',
      'outputs/**',
      'docs/**',
      '.vscode/**',
      '**/.vscode/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...warnRecommendedRules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
