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
    description: 'Shows help information',
  },
  {
    name: 'no arguments shows help',
    args: [],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Default behavior when no arguments provided',
  },
  {
    name: 'version command (shows help)',
    args: ['version'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Version command falls back to help',
  },
  {
    name: 'invalid command shows help',
    args: ['invalid-command'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Invalid commands show help instead of erroring',
  },
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
    description: 'Non-existent files are handled gracefully',
  },
  {
    name: 'check unsupported file type',
    args: ['check', 'test.txt'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Unsupported file types are ignored',
  },
  {
    name: 'check directory instead of file',
    args: ['check', '.'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Directories are handled gracefully',
  },
  {
    name: 'check without file argument',
    args: ['check'],
    expectedExitCode: 0,
    expectedStdout: /Usage:/,
    description: 'Missing file argument shows help',
  },
];

/**
 * Configuration management command test cases - All supported languages
 */
export const configCommands: CLITestCase[] = [
  // Enable tests for all languages
  {
    name: 'enable typescript',
    args: ['enable', 'typescript'],
    expectedExitCode: 0,
    expectedStdout: /TypeScript checking enabled/,
    description: 'Enables TypeScript checking',
  },
  {
    name: 'enable python',
    args: ['enable', 'python'],
    expectedExitCode: 0,
    expectedStdout: /Python checking enabled/,
    description: 'Enables Python checking',
  },
  {
    name: 'enable go',
    args: ['enable', 'go'],
    expectedExitCode: 0,
    expectedStdout: /Go checking enabled/,
    description: 'Enables Go checking',
  },
  {
    name: 'enable rust',
    args: ['enable', 'rust'],
    expectedExitCode: 0,
    expectedStdout: /Rust checking enabled/,
    description: 'Enables Rust checking',
  },
  {
    name: 'enable java',
    args: ['enable', 'java'],
    expectedExitCode: 0,
    expectedStdout: /Java checking enabled/,
    description: 'Enables Java checking',
  },
  {
    name: 'enable cpp',
    args: ['enable', 'cpp'],
    expectedExitCode: 0,
    expectedStdout: /C\+\+ checking enabled/,
    description: 'Enables C++ checking',
  },
  {
    name: 'enable php',
    args: ['enable', 'php'],
    expectedExitCode: 0,
    expectedStdout: /PHP checking enabled/,
    description: 'Enables PHP checking',
  },
  {
    name: 'enable scala',
    args: ['enable', 'scala'],
    expectedExitCode: 0,
    expectedStdout: /Scala checking enabled/,
    description: 'Enables Scala checking',
  },
  {
    name: 'enable lua',
    args: ['enable', 'lua'],
    expectedExitCode: 0,
    expectedStdout: /Lua checking enabled/,
    description: 'Enables Lua checking',
  },
  {
    name: 'enable elixir',
    args: ['enable', 'elixir'],
    expectedExitCode: 0,
    expectedStdout: /Elixir checking enabled/,
    description: 'Enables Elixir checking',
  },
  {
    name: 'enable terraform',
    args: ['enable', 'terraform'],
    expectedExitCode: 0,
    expectedStdout: /Terraform checking enabled/,
    description: 'Enables Terraform checking',
  },

  // Disable tests for all languages
  {
    name: 'disable typescript',
    args: ['disable', 'typescript'],
    expectedExitCode: 0,
    expectedStdout: /TypeScript checking disabled/,
    description: 'Disables TypeScript checking',
  },
  {
    name: 'disable python',
    args: ['disable', 'python'],
    expectedExitCode: 0,
    expectedStdout: /Python checking disabled/,
    description: 'Disables Python checking',
  },
  {
    name: 'disable go',
    args: ['disable', 'go'],
    expectedExitCode: 0,
    expectedStdout: /Go checking disabled/,
    description: 'Disables Go checking',
  },
  {
    name: 'disable rust',
    args: ['disable', 'rust'],
    expectedExitCode: 0,
    expectedStdout: /Rust checking disabled/,
    description: 'Disables Rust checking',
  },
  {
    name: 'disable java',
    args: ['disable', 'java'],
    expectedExitCode: 0,
    expectedStdout: /Java checking disabled/,
    description: 'Disables Java checking',
  },
  {
    name: 'disable cpp',
    args: ['disable', 'cpp'],
    expectedExitCode: 0,
    expectedStdout: /C\+\+ checking disabled/,
    description: 'Disables C++ checking',
  },
  {
    name: 'disable php',
    args: ['disable', 'php'],
    expectedExitCode: 0,
    expectedStdout: /PHP checking disabled/,
    description: 'Disables PHP checking',
  },
  {
    name: 'disable scala',
    args: ['disable', 'scala'],
    expectedExitCode: 0,
    expectedStdout: /Scala checking disabled/,
    description: 'Disables Scala checking',
  },
  {
    name: 'disable lua',
    args: ['disable', 'lua'],
    expectedExitCode: 0,
    expectedStdout: /Lua checking disabled/,
    description: 'Disables Lua checking',
  },
  {
    name: 'disable elixir',
    args: ['disable', 'elixir'],
    expectedExitCode: 0,
    expectedStdout: /Elixir checking disabled/,
    description: 'Disables Elixir checking',
  },
  {
    name: 'disable terraform',
    args: ['disable', 'terraform'],
    expectedExitCode: 0,
    expectedStdout: /Terraform checking disabled/,
    description: 'Disables Terraform checking',
  },

  // Error cases
  {
    name: 'enable invalid language',
    args: ['enable', 'unknown-language'],
    expectedExitCode: 1,
    expectedStderr: /Unknown language/,
    description: 'Rejects unknown languages',
  },
  {
    name: 'disable invalid language',
    args: ['disable', 'fake-lang'],
    expectedExitCode: 1,
    expectedStderr: /Unknown language/,
    description: 'Rejects unknown languages for disable',
  },
  {
    name: 'enable without language argument',
    args: ['enable'],
    expectedExitCode: 1,
    expectedStderr: /Language name required/,
    description: 'Requires language argument for enable',
  },
  {
    name: 'disable without language argument',
    args: ['disable'],
    expectedExitCode: 1,
    expectedStderr: /Language name required/,
    description: 'Requires language argument for disable',
  },
  {
    name: 'status command',
    args: ['status'],
    expectedExitCode: 0,
    expectedStdout: /Language Status:/,
    description: 'Shows current language status',
  },
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
    description: 'Hook command requires event type',
  },
  {
    name: 'hook with invalid event type',
    args: ['hook', 'InvalidEvent'],
    expectedExitCode: 1,
    expectedStderr: /Unknown event type/,
    description: 'Rejects invalid hook event types',
  },
  {
    name: 'PostToolUse hook without data',
    args: ['hook', 'PostToolUse'],
    expectedExitCode: 1,
    expectedStderr: /No hook data provided/,
    stdin: '',
    description: 'PostToolUse hook requires data via stdin',
  },
  {
    name: 'UserPromptSubmit hook without data',
    args: ['hook', 'UserPromptSubmit'],
    expectedExitCode: 1,
    expectedStderr: /No hook data provided/,
    stdin: '',
    description: 'UserPromptSubmit hook requires data via stdin',
  },
  {
    name: 'PostToolUse hook with malformed JSON',
    args: ['hook', 'PostToolUse'],
    expectedExitCode: 1,
    expectedStderr: /Failed to parse hook data/,
    stdin: 'invalid json',
    description: 'Malformed JSON in hook data is rejected',
  },
];

/**
 * Edge case and error scenarios
 */
export const edgeCases: CLITestCase[] = [
  {
    name: 'very long file path',
    args: [
      'check',
      '/very/very/very/very/very/very/very/very/very/very/long/path/that/might/cause/issues/file.ts',
    ],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles very long file paths gracefully',
  },
  {
    name: 'file path with spaces',
    args: ['check', '/path with spaces/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles file paths with spaces',
  },
  {
    name: 'file path with special characters',
    args: ['check', '/path/with-special_chars.and.dots/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles file paths with special characters',
  },
  {
    name: 'unicode in file path',
    args: ['check', '/path/with/unicode/文件.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles unicode characters in file paths',
  },
  {
    name: 'relative file path',
    args: ['check', './relative/path/file.ts'],
    expectedExitCode: 0,
    expectedStdout: '',
    description: 'Handles relative file paths',
  },
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
    description: 'Handles rapid successive commands',
  },
  {
    name: 'command with timeout',
    args: ['check', 'large-file.ts'],
    expectedExitCode: 0,
    timeout: 30000,
    description: 'Handles commands that might take longer',
  },
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
        expectedStdout: /Python checking disabled/,
      },
      {
        name: 'check status shows disabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Python.*Disabled/,
      },
      {
        name: 'enable python',
        args: ['enable', 'python'],
        expectedExitCode: 0,
        expectedStdout: /Python checking enabled/,
      },
      {
        name: 'check status shows enabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Python.*Enabled/,
      },
    ],
  },
  {
    name: 'multiple language configuration',
    steps: [
      {
        name: 'disable multiple languages',
        args: ['disable', 'scala'],
        expectedExitCode: 0,
      },
      {
        name: 'disable another language',
        args: ['disable', 'rust'],
        expectedExitCode: 0,
      },
      {
        name: 'check status shows both disabled',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Scala.*Disabled.*Rust.*Disabled/s,
      },
      {
        name: 'enable one back',
        args: ['enable', 'scala'],
        expectedExitCode: 0,
      },
      {
        name: 'check status shows partial re-enable',
        args: ['status'],
        expectedExitCode: 0,
        expectedStdout: /Scala.*Enabled.*Rust.*Disabled/s,
      },
    ],
  },
];

/**
 * File content scenarios for diagnostic testing - All 11 supported languages
 */
export const diagnosticScenarios = [
  // TypeScript scenarios
  {
    name: 'TypeScript with type errors',
    language: 'typescript',
    extension: '.ts',
    content: 'const x: string = 42; const y: number = "hello";',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean TypeScript file',
    language: 'typescript',
    extension: '.ts',
    content: 'const message: string = "Hello, world!"; console.log(message);',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Python scenarios
  {
    name: 'Python with type errors',
    language: 'python',
    extension: '.py',
    content: 'def func(x: int) -> str:\n    return x + 1  # Type error',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Python file',
    language: 'python',
    extension: '.py',
    content: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("World"))',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Go scenarios
  {
    name: 'Go with compilation errors',
    language: 'go',
    extension: '.go',
    content:
      'package main\n\nfunc main() {\n    undefinedVar := nonExistentFunction()\n    println(undefinedVar)\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Go file',
    language: 'go',
    extension: '.go',
    content: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Rust scenarios
  {
    name: 'Rust with compilation errors',
    language: 'rust',
    extension: '.rs',
    content: 'fn main() {\n    let x = 5;\n    let y = x + "hello"; // Type error\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Rust file',
    language: 'rust',
    extension: '.rs',
    content: 'fn main() {\n    println!("Hello, world!");\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Java scenarios
  {
    name: 'Java with compilation errors',
    language: 'java',
    extension: '.java',
    content:
      'public class Test {\n    public static void main(String[] args) {\n        String x = 42; // Type error\n    }\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Java file',
    language: 'java',
    extension: '.java',
    content:
      'public class Test {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // C++ scenarios
  {
    name: 'C++ with compilation errors',
    language: 'cpp',
    extension: '.cpp',
    content:
      '#include <iostream>\nint main() {\n    std::string x = 42; // Type error\n    return 0;\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean C++ file',
    language: 'cpp',
    extension: '.cpp',
    content:
      '#include <iostream>\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // PHP scenarios
  {
    name: 'PHP with type errors',
    language: 'php',
    extension: '.php',
    content: '<?php\nfunction test(): string {\n    return 123; // Type error\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean PHP file',
    language: 'php',
    extension: '.php',
    content: '<?php\nfunction test(): string {\n    return "Hello, World!";\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Scala scenarios
  {
    name: 'Scala with type errors',
    language: 'scala',
    extension: '.scala',
    content:
      'object Main {\n  def main(args: Array[String]): Unit = {\n    val x: String = 42 // Type error\n  }\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Scala file',
    language: 'scala',
    extension: '.scala',
    content:
      'object Main {\n  def main(args: Array[String]): Unit = {\n    println("Hello, World!")\n  }\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Lua scenarios
  {
    name: 'Lua with syntax errors',
    language: 'lua',
    extension: '.lua',
    content: 'local function test(x)\n    return x +  -- Incomplete expression\nend',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Lua file',
    language: 'lua',
    extension: '.lua',
    content: 'local function test(x)\n    return "Hello, " .. x\nend',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Elixir scenarios
  {
    name: 'Elixir with type errors',
    language: 'elixir',
    extension: '.ex',
    content:
      'defmodule Test do\n  def hello(x) when is_integer(x) do\n    x + "world" # Type error\n  end\nend',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Elixir file',
    language: 'elixir',
    extension: '.ex',
    content:
      'defmodule Test do\n  def hello(x) when is_binary(x) do\n    x <> " world"\n  end\nend',
    expectedDiagnostics: false,
    expectedErrors: false,
  },

  // Terraform scenarios
  {
    name: 'Terraform with configuration errors',
    language: 'terraform',
    extension: '.tf',
    content:
      'resource "aws_instance" "example" {\n  instance_type = "invalid-type"\n  nonexistent_arg = "value"\n}',
    expectedDiagnostics: true,
    expectedErrors: true,
  },
  {
    name: 'clean Terraform file',
    language: 'terraform',
    extension: '.tf',
    content:
      'resource "aws_instance" "example" {\n  instance_type = "t2.micro"\n  ami = "ami-12345678"\n}',
    expectedDiagnostics: false,
    expectedErrors: false,
  },
];

/**
 * Language-specific test data - All 11 supported languages
 */
export const languageTestData = {
  typescript: {
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    validFiles: ['index.ts', 'component.tsx', 'types.d.ts'],
    invalidContent: 'const x: string = 42;',
    validContent: 'const x: string = "hello";',
    name: 'TypeScript',
  },
  javascript: {
    extensions: ['.js', '.jsx'],
    validFiles: ['app.js', 'component.jsx', 'config.js'],
    invalidContent: 'const undefinedVar = nonExistentFunction();',
    validContent: 'const message = "Hello, World!";',
    name: 'JavaScript',
  },
  python: {
    extensions: ['.py', '.pyw'],
    validFiles: ['main.py', 'utils.py', 'test.py'],
    invalidContent: 'def func(x: int) -> str:\n    return x + 1',
    validContent: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"',
    name: 'Python',
  },
  go: {
    extensions: ['.go'],
    validFiles: ['main.go', 'utils.go', 'types.go'],
    invalidContent: 'package main\nfunc main() {\n    undefinedFunction()\n}',
    validContent: 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello")\n}',
    name: 'Go',
  },
  rust: {
    extensions: ['.rs'],
    validFiles: ['main.rs', 'lib.rs', 'mod.rs'],
    invalidContent: 'fn main() {\n    let x = 5;\n    let y = x + "hello";\n}',
    validContent: 'fn main() {\n    println!("Hello, world!");\n}',
    name: 'Rust',
  },
  java: {
    extensions: ['.java'],
    validFiles: ['Main.java', 'Utils.java', 'Test.java'],
    invalidContent:
      'public class Test {\n    public static void main(String[] args) {\n        String x = 42;\n    }\n}',
    validContent:
      'public class Test {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}',
    name: 'Java',
  },
  cpp: {
    extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h++'],
    validFiles: ['main.cpp', 'utils.hpp', 'lib.cc'],
    invalidContent: '#include <iostream>\nint main() {\n    std::string x = 42;\n    return 0;\n}',
    validContent:
      '#include <iostream>\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
    name: 'C++',
  },
  php: {
    extensions: ['.php'],
    validFiles: ['index.php', 'config.php', 'utils.php'],
    invalidContent: '<?php\nfunction test(): string {\n    return 123;\n}',
    validContent: '<?php\nfunction test(): string {\n    return "Hello, World!";\n}',
    name: 'PHP',
  },
  scala: {
    extensions: ['.scala', '.sc'],
    validFiles: ['Main.scala', 'Utils.scala', 'Types.scala'],
    invalidContent:
      'object Main {\n  def main(args: Array[String]): Unit = {\n    val x: String = 42\n  }\n}',
    validContent:
      'object Main {\n  def main(args: Array[String]): Unit = {\n    println("Hello, World!")\n  }\n}',
    name: 'Scala',
  },
  lua: {
    extensions: ['.lua'],
    validFiles: ['main.lua', 'config.lua', 'utils.lua'],
    invalidContent: 'local function test(x)\n    return x + "hello"\nend',
    validContent: 'local function test(x)\n    return "Hello, " .. x\nend',
    name: 'Lua',
  },
  elixir: {
    extensions: ['.ex', '.exs'],
    validFiles: ['main.ex', 'utils.ex', 'test.exs'],
    invalidContent:
      'defmodule Test do\n  def hello(x) when is_integer(x) do\n    x + "world"\n  end\nend',
    validContent:
      'defmodule Test do\n  def hello(x) when is_binary(x) do\n    x <> " world"\n  end\nend',
    name: 'Elixir',
  },
  terraform: {
    extensions: ['.tf', '.tfvars'],
    validFiles: ['main.tf', 'variables.tf', 'outputs.tf'],
    invalidContent:
      'resource "aws_instance" "example" {\n  instance_type = "invalid-type"\n  nonexistent_arg = "value"\n}',
    validContent:
      'resource "aws_instance" "example" {\n  instance_type = "t2.micro"\n  ami = "ami-12345678"\n}',
    name: 'Terraform',
  },
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
    ...performanceScenarios,
  ];
}

/**
 * Helper to filter test cases by category
 */
export function getTestCasesByCategory(category: string): CLITestCase[] {
  switch (category) {
    case 'basic':
      return basicCommands;
    case 'file':
      return fileCheckCommands;
    case 'config':
      return configCommands;
    case 'hook':
      return hookCommands;
    case 'edge':
      return edgeCases;
    case 'performance':
      return performanceScenarios;
    default:
      return getAllTestCases();
  }
}
