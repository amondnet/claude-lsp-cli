import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

export default [
  // Base recommended config
  eslint.configs.recommended,
  
  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Bun: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
    },
    rules: {
      // Configure base rule to ignore underscore-prefixed variables
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      
      // TypeScript specific rules (same pattern)
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      
      // Import rules
      'import/order': 'off',  // Too strict for existing codebase
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/named': 'off', // TypeScript handles this
      
      // General best practices
      'no-console': 'off', // CLI tool needs console
      'no-debugger': 'error',
      'no-alert': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['error', 'all'],
      'no-throw-literal': 'error',
      
      // Code quality
      'complexity': ['warn', 30],  // Increased for complex CLI logic
      'max-depth': ['warn', 5],    // Increased for nested conditionals
      'max-lines': ['warn', { max: 2000, skipBlankLines: true, skipComments: true }],  // Increased for file-checker.ts
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],  // Increased for complex functions
      'max-params': ['warn', 6],   // Increased for function signatures
    },
  },
  
  // Test files - relax some rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        require: 'readonly',  // Tests may need require for mocking
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  
  // Example files - ignore most rules
  {
    files: ['examples/**/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off',
      'no-debugger': 'off',
    },
  },
  
  // Checker files - these implement interfaces with specific signatures
  {
    files: ['src/checkers/*.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  
  // Prettier config (disables formatting rules that conflict)
  eslintConfigPrettier,
  
  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'bin/',
      'dist/',
      'build/',
      'coverage/',
      '*.min.js',
      'tmp/',
      '.git/',
      '.source/',        // Generated files from language setup actions
      'examples/**/*',    // Examples have intentional errors
      'benchmarks/**/*', // Benchmark files have intentional errors
      'hooks/**/*',      // Legacy hook files
      '**/*.d.ts',       // Declaration files
      '**/*.js',         // JavaScript files (this is a TypeScript project)
    ],
  },
];