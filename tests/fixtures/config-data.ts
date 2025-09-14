/**
 * Configuration data templates for testing configuration management
 */

export interface LspConfig {
  disabled?: string[];
  enabled?: string[];
  globalTimeout?: number;
  debugMode?: boolean;
  [key: string]: any;
}

/**
 * LSP configuration templates
 */
export const lspConfigs = {
  /** Default empty config */
  empty: (): LspConfig => ({}),

  /** Config with some languages disabled */
  someDisabled: (): LspConfig => ({
    disabled: ['python', 'scala'],
  }),

  /** Config with many languages disabled */
  manyDisabled: (): LspConfig => ({
    disabled: ['python', 'scala', 'java', 'rust', 'go'],
  }),

  /** Config with explicit enabled languages */
  explicitEnabled: (): LspConfig => ({
    enabled: ['typescript', 'javascript', 'python'],
  }),

  /** Config with custom timeout */
  withTimeout: (): LspConfig => ({
    globalTimeout: 45000,
    disabled: ['scala'],
  }),

  /** Config with debug mode */
  withDebug: (): LspConfig => ({
    debugMode: true,
    disabled: [],
  }),

  /** Complex configuration */
  complex: (): LspConfig => ({
    disabled: ['scala', 'elixir'],
    globalTimeout: 60000,
    debugMode: false,
    customSettings: {
      typescript: {
        strictMode: true,
        target: 'ES2020',
      },
      python: {
        useMypy: true,
        strictOptional: false,
      },
    },
  }),

  /** Invalid JSON structure (for error testing) */
  invalid: '{ "disabled": ["python", missing_quote: true }',

  /** Malformed configuration */
  malformed: 'not json at all',

  /** Config with unknown properties */
  withUnknownProps: (): LspConfig => ({
    disabled: ['python'],
    unknownProperty: 'should be ignored',
    anotherUnknown: { nested: true },
  }),
};

/**
 * Claude settings.json templates (for hook installation)
 */
export const claudeSettings = {
  /** Empty settings */
  empty: {
    hooks: {},
  },

  /** Settings with existing hooks */
  withExistingHooks: {
    hooks: {
      PostToolUse: ['existing-hook-1.sh', 'existing-hook-2.js'],
      UserPromptSubmit: ['prompt-hook.py'],
    },
  },

  /** Settings with LSP hooks already installed */
  withLspHooks: {
    hooks: {
      PostToolUse: ['claude-lsp-cli hook PostToolUse'],
      UserPromptSubmit: ['claude-lsp-cli hook UserPromptSubmit'],
    },
  },

  /** Settings with mixed hooks */
  mixed: {
    hooks: {
      PostToolUse: ['existing-hook.sh', 'claude-lsp-cli hook PostToolUse'],
      UserPromptSubmit: ['claude-lsp-cli hook UserPromptSubmit', 'another-hook.py'],
    },
    otherSettings: {
      theme: 'dark',
      fontSize: 14,
    },
  },
};

/**
 * Environment variable scenarios
 */
export const environmentScenarios = {
  /** Standard environment */
  standard: {
    HOME: '/Users/testuser',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'test',
  },

  /** Windows environment */
  windows: {
    USERPROFILE: 'C:\\Users\\testuser',
    PATH: 'C:\\Windows\\System32;C:\\Program Files\\nodejs',
    OS: 'Windows_NT',
  },

  /** Linux environment */
  linux: {
    HOME: '/home/testuser',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    USER: 'testuser',
    SHELL: '/bin/bash',
  },

  /** Limited environment (CI-like) */
  limited: {
    HOME: '/tmp/test-home',
    PATH: '/usr/bin:/bin',
    CI: 'true',
  },

  /** Environment without nodejs tools */
  noNodejs: {
    HOME: '/Users/testuser',
    PATH: '/usr/bin:/bin', // No /usr/local/bin where node tools usually are
  },
};

/**
 * Directory structure templates
 */
export const directoryStructures = {
  /** Simple project structure */
  simple: {
    'package.json': '{"name": "test-project", "version": "1.0.0"}',
    'src/index.ts': 'console.log("Hello, world!");',
    'src/utils.ts': 'export const utils = {};',
  },

  /** Complex project structure */
  complex: {
    'package.json': JSON.stringify(lspConfigs.complex(), null, 2),
    'tsconfig.json': '{"compilerOptions": {"strict": true}}',
    'src/index.ts': 'import { utils } from "./utils";',
    'src/utils.ts': 'export const utils = {};',
    'src/components/Button.tsx': 'export const Button = () => <button />;',
    'tests/index.test.ts': 'import { utils } from "../src/utils";',
    'README.md': '# Test Project',
  },

  /** Multi-language project */
  multiLanguage: {
    'package.json': '{"name": "multi-lang", "version": "1.0.0"}',
    'frontend/src/app.ts': 'console.log("TypeScript");',
    'backend/main.py': 'print("Python")',
    'services/main.go': 'package main\nfunc main() {}',
    'scripts/build.js': 'console.log("JavaScript");',
  },

  /** Project with configuration files */
  withConfigs: {
    'package.json': '{"name": "configured-project"}',
    '.eslintrc.json': '{"extends": ["@typescript-eslint/recommended"]}',
    '.prettierrc': '{"semi": true}',
    'tsconfig.json': '{"compilerOptions": {"strict": true}}',
    'jest.config.js': 'module.exports = { preset: "ts-jest" };',
    'src/index.ts': 'console.log("Hello");',
  },
};

/**
 * Helper to create test configuration objects
 */
export function createTestConfig(scenario: keyof typeof lspConfigs): LspConfig {
  const config = lspConfigs[scenario];
  return typeof config === 'function' ? config() : config;
}

/**
 * Helper to serialize configuration for file writing
 */
export function serializeConfig(config: LspConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Language status templates for testing status display
 */
export const languageStatuses = {
  /** All languages enabled */
  allEnabled: `🟢 Language Status:
  TypeScript: ✅ Enabled
  JavaScript: ✅ Enabled  
  Python: ✅ Enabled
  Go: ✅ Enabled
  Rust: ✅ Enabled
  Java: ✅ Enabled
  PHP: ✅ Enabled
  Scala: ✅ Enabled
  C++: ✅ Enabled
  Lua: ✅ Enabled
  Elixir: ✅ Enabled`,

  /** Some languages disabled */
  someDisabled: `🟢 Language Status:
  TypeScript: ✅ Enabled
  JavaScript: ✅ Enabled  
  Python: ❌ Disabled
  Go: ✅ Enabled
  Rust: ✅ Enabled
  Java: ✅ Enabled
  PHP: ✅ Enabled
  Scala: ❌ Disabled
  C++: ✅ Enabled
  Lua: ✅ Enabled
  Elixir: ✅ Enabled`,

  /** Most languages disabled */
  mostDisabled: `🔴 Language Status:
  TypeScript: ✅ Enabled
  JavaScript: ✅ Enabled  
  Python: ❌ Disabled
  Go: ❌ Disabled
  Rust: ❌ Disabled
  Java: ❌ Disabled
  PHP: ❌ Disabled
  Scala: ❌ Disabled
  C++: ❌ Disabled
  Lua: ❌ Disabled
  Elixir: ❌ Disabled`,
};

/**
 * Command result templates
 */
export const commandResults = {
  /** Successful enable command */
  enableSuccess: (language: string) =>
    `✅ ${language.charAt(0).toUpperCase() + language.slice(1)} checking enabled`,

  /** Successful disable command */
  disableSuccess: (language: string) =>
    `❌ ${language.charAt(0).toUpperCase() + language.slice(1)} checking disabled`,

  /** Unknown language error */
  unknownLanguage: (language: string) => `❌ Unknown language: ${language}`,

  /** Configuration error */
  configError: (error: string) => `❌ Configuration error: ${error}`,

  /** Help text */
  help: `claude-lsp-cli - File-based diagnostics for 11+ programming languages

Usage:
  claude-lsp-cli <command> [options]

Commands:
  check <file>         Check a file for diagnostics
  enable <language>    Enable checking for a language
  disable <language>   Disable checking for a language
  status              Show language status
  help                Show this help message
  hook <event>        Handle Claude Code hook events

Examples:
  claude-lsp-cli check src/index.ts
  claude-lsp-cli enable python
  claude-lsp-cli disable scala
  claude-lsp-cli status`,
};
