/**
 * Mock hook data for testing PostToolUse and UserPromptSubmit handlers
 */

export interface HookEvent {
  event: string;
  timestamp: number;
  data: any;
}

/**
 * PostToolUse Hook Data Templates
 */
export const postToolUseEvents = {
  /** Basic file edit event */
  fileEdit: (filePath: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'str_replace_editor',
      parameters: {
        command: 'str_replace',
        path: filePath,
        old_str: 'old content',
        new_str: 'new content'
      },
      result: 'Edit completed'
    }
  }),

  /** Multiple file edits */
  multipleFileEdits: (filePaths: string[]): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'str_replace_editor',
      parameters: {
        command: 'str_replace',
        paths: filePaths,
        changes: filePaths.map(path => ({
          path,
          old_str: 'old content',
          new_str: 'new content'
        }))
      },
      result: 'Multiple edits completed'
    }
  }),

  /** File creation event */
  fileCreate: (filePath: string, content: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'str_replace_editor',
      parameters: {
        command: 'create',
        path: filePath,
        file_text: content
      },
      result: 'File created'
    }
  }),

  /** Write tool usage */
  writeFile: (filePath: string, content: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'Write',
      parameters: {
        file_path: filePath,
        content: content
      },
      result: `Successfully wrote to ${filePath}`
    }
  }),

  /** Edit tool usage */
  editFile: (filePath: string, oldStr: string, newStr: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'Edit',
      parameters: {
        file_path: filePath,
        old_string: oldStr,
        new_string: newStr
      },
      result: `Successfully edited ${filePath}`
    }
  }),

  /** Non-file tool (should be ignored) */
  bashCommand: (command: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'bash',
      parameters: {
        command: command
      },
      result: 'Command executed'
    }
  }),

  /** Complex nested data */
  complexFileOperation: (filePath: string): HookEvent => ({
    event: 'PostToolUse',
    timestamp: Date.now(),
    data: {
      tool: 'str_replace_editor',
      parameters: {
        command: 'str_replace',
        path: filePath,
        old_str: 'function test() {\n  console.log("old");\n}',
        new_str: 'function test() {\n  console.log("new");\n  return true;\n}',
        context: {
          lineNumbers: [1, 2, 3],
          surroundingCode: true
        }
      },
      result: 'Complex edit completed',
      metadata: {
        linesChanged: 3,
        charactersAdded: 15
      }
    }
  })
};

/**
 * UserPromptSubmit Hook Data Templates
 */
export const userPromptSubmitEvents = {
  /** Regular user message (non-LSP) */
  regularMessage: (prompt: string): HookEvent => ({
    event: 'UserPromptSubmit',
    timestamp: Date.now(),
    data: {
      prompt: prompt
    }
  }),

  /** LSP command */
  lspCommand: (command: string): HookEvent => ({
    event: 'UserPromptSubmit',
    timestamp: Date.now(),
    data: {
      prompt: `>lsp: ${command}`
    }
  }),

  /** Empty prompt */
  emptyPrompt: (): HookEvent => ({
    event: 'UserPromptSubmit',
    timestamp: Date.now(),
    data: {
      prompt: ''
    }
  }),

  /** Missing prompt field */
  missingPrompt: (): HookEvent => ({
    event: 'UserPromptSubmit',
    timestamp: Date.now(),
    data: {}
  }),

  /** Malformed data */
  malformedData: (): HookEvent => ({
    event: 'UserPromptSubmit',
    timestamp: Date.now(),
    data: null
  })
};

/**
 * File path test cases for various scenarios
 */
export const testFilePaths = {
  /** TypeScript files */
  typescript: [
    '/project/src/index.ts',
    '/project/src/components/Button.tsx',
    '/project/tests/index.test.ts'
  ],

  /** Python files */
  python: [
    '/project/main.py',
    '/project/src/utils.py',
    '/project/tests/test_main.py'
  ],

  /** JavaScript files */
  javascript: [
    '/project/src/app.js',
    '/project/config/webpack.config.js',
    '/project/scripts/build.js'
  ],

  /** Mixed language project */
  mixed: [
    '/project/src/index.ts',
    '/project/api/server.py',
    '/project/config/main.go',
    '/project/styles/app.scss',
    '/project/README.md'
  ],

  /** Relative paths (should be converted to absolute) */
  relative: [
    'src/index.ts',
    './components/Button.tsx',
    '../utils/helper.js'
  ],

  /** Edge cases */
  edgeCases: [
    '/path with spaces/file.ts',
    '/path/with-dashes/file.ts',
    '/path/with_underscores/file.ts',
    '/path/with.dots/file.ts',
    '/very/deep/nested/directory/structure/file.ts'
  ]
};

/**
 * Helper to create batch hook events for testing multiple files
 */
export function createBatchHookEvents(filePaths: string[], eventType: 'edit' | 'create' = 'edit'): HookEvent[] {
  return filePaths.map(path => {
    if (eventType === 'create') {
      return postToolUseEvents.fileCreate(path, `// Generated content for ${path}`);
    }
    return postToolUseEvents.fileEdit(path);
  });
}

/**
 * Helper to serialize hook data for CLI input
 */
export function serializeHookEvent(event: HookEvent): string {
  return JSON.stringify(event);
}

/**
 * Common LSP commands for testing
 */
export const lspCommands = [
  'status',
  'help',
  'enable python',
  'disable typescript',
  'check /path/to/file.ts',
  'reset',
  'version'
];