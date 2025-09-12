/**
 * CLI command scenarios and test cases
 */

export interface CLITestCase {
  name: string;
  args: string[];
  expectedExitCode: number;
  expectedStdout?: string | RegExp;
  expectedStderr?: string | RegExp;
  timeout?: number;
  stdin?: string;
  description?: string;
}

/**
 * Basic command test cases
 */
export const basicCommands: CLITestCase[] = [
  {
    name: 'help command',
    args: ['help'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Shows help information'
  },
  {
    name: 'no arguments shows help',
    args: [],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Default behavior when no arguments provided'
  },
  {
    name: 'version command (shows help)',
    args: ['version'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Version command falls back to help'
  },
  {
    name: 'invalid command shows help',
    args: ['invalid-command'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Invalid commands show help instead of erroring'
  }
];

/**
 * File checking command test cases
 */
export const fileCheckCommands: CLITestCase[] = [
  {
    name: 'check non-existent file',
    args: ['check', '/non/existent/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Non-existent files are handled gracefully'
  },
  {
    name: 'check unsupported file type',
    args: ['check', 'test.txt'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Unsupported file types are ignored'
  },
  {
    name: 'check directory instead of file',
    args: ['check', '.'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Directories are handled gracefully'
  },
  {
    name: 'check without file argument',
    args: ['check'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Missing file argument shows help'
  }
];

/**
 * Configuration management command test cases
 */
export const configCommands: CLITestCase[] = [
  {
    name: 'enable valid language',
    args: ['enable', 'python'],
    expectedExitCode: 0,
    expectedStdout: /Python checking enabled/,
    description: 'Enables checking for a language'
  },
  {
    name: 'disable valid language',
    args: ['disable', 'typescript'],
    expectedExitCode: 0,
    expectedStdout: /TypeScript checking disabled/,
    description: 'Disables checking for a language'
  },
  {
    name: 'enable invalid language',
    args: ['enable', 'unknown-language'],
    expectedExitCode: 1,
    expectedStderr: /Unknown language/,
    description: 'Rejects unknown languages'
  },
  {
    name: 'disable invalid language',
    args: ['disable', 'fake-lang'],
    expectedExitCode: 1,
    expectedStderr: /Unknown language/,
    description: 'Rejects unknown languages for disable'
  },
  {
    name: 'enable without language argument',
    args: ['enable'],
    expectedExitCode: 1,
    expectedStderr: /Language name required/,
    description: 'Requires language argument for enable'
  },
  {
    name: 'disable without language argument',
    args: ['disable'],
    expectedExitCode: 1,
    expectedStderr: /Language name required/,
    description: 'Requires language argument for disable'
  },
  {
    name: 'status command',
    args: ['status'],
    expectedExitCode: 0,
    expectedStdout: /Language Status:/,
    description: 'Shows current language status'
  }
];

/**
 * Hook handling command test cases
 */
export const hookCommands: CLITestCase[] = [
  {
    name: 'hook without event type',
    args: ['hook'],
    expectedExitCode: 1,
    expectedStderr: /Event type required/,
    description: 'Hook command requires event type'
  },
  {
    name: 'hook with invalid event type',
    args: ['hook', 'InvalidEvent'],
    expectedExitCode: 1,
    expectedStderr: /Unknown event type/,
    description: 'Rejects invalid hook event types'
  },
  {
    name: 'PostToolUse hook without data',
    args: ['hook', 'PostToolUse'],
    expectedExitCode: 1,
    expectedStderr: /No hook data provided/,
    stdin: '',
    description: 'PostToolUse hook requires data via stdin'
  },
  {
    name: 'UserPromptSubmit hook without data',
    args: ['hook', 'UserPromptSubmit'],
    expectedExitCode: 1,
    expectedStderr: /No hook data provided/,
    stdin: '',
    description: 'UserPromptSubmit hook requires data via stdin'
  },
  {
    name: 'PostToolUse hook with malformed JSON',
    args: ['hook', 'PostToolUse'],
    expectedExitCode: 1,
    expectedStderr: /Failed to parse hook data/,
    stdin: 'invalid json',
    description: 'Malformed JSON in hook data is rejected'
  }
];

/**
 * Edge case and error scenarios
 */
export const edgeCases: CLITestCase[] = [
  {
    name: 'very long file path',
    args: ['check', '/very/very/very/very/very/very/very/very/very/very/long/path/that/might/cause/issues/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles very long file paths gracefully'
  },
  {
    name: 'file path with spaces',
    args: ['check', '/path with spaces/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles file paths with spaces'
  },
  {
    name: 'file path with special characters',
    args: ['check', '/path/with-special_chars.and.dots/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles file paths with special characters'
  },
  {
    name: 'unicode in file path',
    args: ['check', '/path/with/unicode/文件.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles unicode characters in file paths'
  },
  {
    name: 'relative file path',
    args: ['check', './relative/path/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles relative file paths'
  }
];

/**
 * Performance and stress test scenarios
 */
export const performanceScenarios: CLITestCase[] = [
  {
    name: 'multiple rapid commands',
    args: ['status'],
    expectedExitCode: 0,
    expectedStdout: /Language Status:/,
    description: 'Handles rapid successive commands'
  },
  {
    name: 'command with timeout',
    args: ['check', 'large-file.ts'],
    expectedExitCode: 0,
    timeout: 30000,
    description: 'Handles commands that might take longer'
  }
];

/**
 * Integration test scenarios combining multiple operations
 */
export const integrationScenarios = [
  {
    name: 'disable then enable workflow',
    steps: [
      {
        name: 'disable python',
        args: ['disable', 'python'],
        expectedExitCode: 0,
        expectedStdout: /Python checking disabled/
      },
      {
        name: 'check status shows disabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Python.*Disabled/
      },
      {
        name: 'enable python',
        args: ['enable', 'python'],
        expectedExitCode: 0,
        expectedStdout: /Python checking enabled/
      },
      {
        name: 'check status shows enabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Python.*Enabled/
      }
    ]
  },
  {
    name: 'multiple language configuration',
    steps: [
      {
        name: 'disable multiple languages',
        args: ['disable', 'scala'],
        expectedExitCode: 0
      },
      {
        name: 'disable another language',
        args: ['disable', 'rust'],
        expectedExitCode: 0
      },
      {
        name: 'check status shows both disabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Scala.*Disabled.*Rust.*Disabled/s
      },
      {
        name: 'enable one back',
        args: ['enable', 'scala'],
        expectedExitCode: 0
      },
      {
        name: 'check status shows partial re-enable',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Scala.*Enabled.*Rust.*Disabled/s
      }
    ]
  }
];

/**
 * File content scenarios for diagnostic testing
 */
export const diagnosticScenarios = [
  {
    name: 'TypeScript with type errors',
    language: 'typescript',
    extension: '.ts',
    content: 'const x: string = 42; const y: number = "hello";',
    expectedDiagnostics: true,
    expectedErrors: true
  },
  {
    name: 'clean TypeScript file',
    language: 'typescript',
    extension: '.ts',
    content: 'const message: string = "Hello, world!"; console.log(message);',
    expectedDiagnostics: false,
    expectedErrors: false
  },
  {
    name: 'Python with type errors',
    language: 'python',
    extension: '.py',
    content: 'def func(x: int) -> str:\n    return x + 1  # Type error',
    expectedDiagnostics: true,
    expectedErrors: true
  },
  {
    name: 'clean Python file',
    language: 'python',
    extension: '.py',
    content: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("World"))',
    expectedDiagnostics: false,
    expectedErrors: false
  },
  {
    name: 'Go with compilation errors',
    language: 'go',
    extension: '.go',
    content: 'package main\n\nfunc main() {\n    undefinedVar := nonExistentFunction()\n    println(undefinedVar)\n}',
    expectedDiagnostics: true,
    expectedErrors: true
  },
  {
    name: 'clean Go file',
    language: 'go',
    extension: '.go',
    content: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
    expectedDiagnostics: false,
    expectedErrors: false
  }
];

/**
 * Language-specific test data
 */
export const languageTestData = {
  typescript: {
    extensions: ['.ts', '.tsx'],
    validFiles: ['index.ts', 'component.tsx', 'types.d.ts'],
    invalidContent: 'const x: string = 42;',
    validContent: 'const x: string = "hello";'
  },
  javascript: {
    extensions: ['.js', '.jsx'],
    validFiles: ['app.js', 'component.jsx', 'config.js'],
    invalidContent: 'const undefinedVar = nonExistentFunction();',
    validContent: 'const message = "Hello, World!";'
  },
  python: {
    extensions: ['.py', '.pyw'],
    validFiles: ['main.py', 'utils.py', 'test.py'],
    invalidContent: 'def func(x: int) -> str:\n    return x + 1',
    validContent: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"'
  },
  go: {
    extensions: ['.go'],
    validFiles: ['main.go', 'utils.go', 'types.go'],
    invalidContent: 'package main\nfunc main() {\n    undefinedFunction()\n}',
    validContent: 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello")\n}'
  },
  rust: {
    extensions: ['.rs'],
    validFiles: ['main.rs', 'lib.rs', 'mod.rs'],
    invalidContent: 'fn main() {\n    let x = 5;\n    let y = x + "hello";\n}',
    validContent: 'fn main() {\n    println!("Hello, world!");\n}'
  },
  java: {
    extensions: ['.java'],
    validFiles: ['Main.java', 'Utils.java', 'Test.java'],
    invalidContent: 'public class Test {\n    public static void main(String[] args) {\n        String x = 42;\n    }\n}',
    validContent: 'public class Test {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}'
  }
};

/**
 * Helper function to get all test cases
 */
export function getAllTestCases(): CLITestCase[] {
  return [
    ...basicCommands,
    ...fileCheckCommands,
    ...configCommands,
    ...hookCommands,
    ...edgeCases,
    ...performanceScenarios
  ];
}

/**
 * Helper to filter test cases by category
 */
export function getTestCasesByCategory(category: string): CLITestCase[] {
  switch (category) {
    case 'basic': return basicCommands;
    case 'file': return fileCheckCommands;
    case 'config': return configCommands;
    case 'hook': return hookCommands;
    case 'edge': return edgeCases;
    case 'performance': return performanceScenarios;
    default: return getAllTestCases();
  }
}