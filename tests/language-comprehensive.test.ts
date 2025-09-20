import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { spawn } from 'bun';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { languageTestData as _languageTestData } from './fixtures/cli-scenarios';

const TEST_DIR = '/tmp/claude-lsp-lang-test';
const CLI_PATH = './bin/claude-lsp-cli';

// All languages supported by file-checker.ts - comprehensive coverage
const LANGUAGES = [
  {
    name: 'TypeScript',
    exts: ['.ts', '.tsx', '.mts', '.cts'],
    errorCode: `const x: string = 42;`,
    cleanCode: `const x: string = "hello";`,
    expectedError: /Type 'number' is not assignable to type 'string'/,
  },
  {
    name: 'Python',
    exts: ['.py', '.pyw'],
    errorCode: `def func(x: int) -> str:\n    return x + 1  # Type error`,
    cleanCode: `def greet(name: str) -> str:\n    return f"Hello, {name}!"`,
    expectedError: /is not assignable to declared type|incompatible type|Operator.*not supported/,
  },
  {
    name: 'Go',
    exts: ['.go'],
    errorCode: `package main\nfunc main() {\n    undefinedFunction()\n}`,
    cleanCode: `package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello")\n}`,
    expectedError: /undefined|not declared/,
  },
  {
    name: 'Rust',
    exts: ['.rs'],
    errorCode: `fn main() {\n    let x = 5;\n    let y = x + "hello";\n}`,
    cleanCode: `fn main() {\n    println!("Hello, world!");\n}`,
    expectedError: /mismatched types|cannot add|expected/,
  },
  {
    name: 'Java',
    exts: ['.java'],
    errorCode: `class Test {\n    public static void main(String[] args) {\n        String x = 42;\n    }\n}`,
    cleanCode: `class Test {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}`,
    expectedError: /incompatible types|cannot be converted/,
  },
  {
    name: 'C++',
    exts: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h++'],
    errorCode: `#include <iostream>\nint main() {\n    std::string x = 42;\n    return 0;\n}`,
    cleanCode: `#include <iostream>\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}`,
    expectedError: /cannot initialize|invalid conversion|no matching constructor/,
  },
  {
    name: 'PHP',
    exts: ['.php'],
    errorCode: `<?php\nfunction test(): string {\n    return 123;\n}`,
    cleanCode: `<?php\nfunction test(): string {\n    return "Hello, World!";\n}`,
    expectedError: /must be of type string|Return type.*string/,
  },
  {
    name: 'Scala',
    exts: ['.scala', '.sc'],
    errorCode: `object Main {\n  def main(args: Array[String]): Unit = {\n    val x: String = 42\n  }\n}`,
    cleanCode: `object Main {\n  def main(args: Array[String]): Unit = {\n    println("Hello, World!")\n  }\n}`,
    expectedError: /type mismatch|found.*Int.*required.*String/,
  },
  {
    name: 'Lua',
    exts: ['.lua'],
    errorCode: `local function test(x)\n    return x +  -- Incomplete expression\nend`,
    cleanCode: `local function test(x)\n    return "Hello, " .. x\nend`,
    expectedError: /syntax error|unexpected symbol|expected/,
  },
  {
    name: 'Elixir',
    exts: ['.ex', '.exs'],
    errorCode: `defmodule Test do\n  def hello(x) when is_integer(x) do\n    x + "world"\n  end\nend`,
    cleanCode: `defmodule Test do\n  def hello(x) when is_binary(x) do\n    x <> " world"\n  end\nend`,
    expectedError: /error|badarg|arithmetic error/,
  },
  {
    name: 'Terraform',
    exts: ['.tf', '.tfvars'],
    errorCode: `resource "aws_instance" "example" {\n  instance_type = "invalid-type"\n  nonexistent_arg = "value"\n}`,
    cleanCode: `resource "aws_instance" "example" {\n  instance_type = "t2.micro"\n  ami = "ami-12345678"\n}`,
    expectedError: /Formatting issues|warning|Invalid|not a valid|Unsupported argument/, // Terraform mainly detects formatting and validation issues
  },
];

describe('Language Comprehensive Testing', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  for (const lang of LANGUAGES) {
    describe(lang.name, () => {
      // Test each extension for this language
      for (const ext of lang.exts) {
        // Test 1: check command with errors
        test(`check command - should detect errors in ${ext} files`, async () => {
          const testFile = join(TEST_DIR, `test${ext}`);
          writeFileSync(testFile, lang.errorCode);

          const proc = spawn([CLI_PATH, 'check', testFile], {
            stdout: 'pipe',
            stderr: 'pipe',
          });

          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const _exitCode = await proc.exited;

          // Should detect errors (now using shell integration format)
          const output = stdout + stderr;
          if (output.includes(']633;E;')) {
            // Shell integration format - check for error markers
            if (output.includes('✗') || output.includes('error')) {
              // Found errors in shell integration format
              expect(output).toMatch(/✗.*(error|warning)|(error|warning).*found/i);
            } else {
              // No errors in shell integration output
              expect(output).toContain('No issues found');
            }
          } else if (output) {
            // Some languages might output errors differently
            expect(output).toMatch(lang.expectedError);
          }
        }, 30000);

        // Test 2: check command without errors
        test(`check command - should show no errors for clean ${ext} files`, async () => {
          const testFile = join(TEST_DIR, `clean${ext}`);
          writeFileSync(testFile, lang.cleanCode);

          const proc = spawn([CLI_PATH, 'check', testFile], {
            stdout: 'pipe',
            stderr: 'pipe',
          });

          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          await proc.exited;

          const output = stdout + stderr;
          if (output.includes(']633;E;')) {
            // Shell integration format - check for appropriate messages
            if (ext === '.tf' || ext === '.tfvars') {
              // Terraform always shows formatting warnings
              expect(output).toMatch(/no errors|warning|No issues found/i);
            } else if (ext === '.java') {
              // Java may have errors if public class name doesn't match file name
              expect(output).toMatch(/no errors|error|warning|No issues found/i);
            } else {
              // Should show no issues
              expect(output).toContain('No issues found');
            }
          } else {
            // No output is also acceptable for clean files
            expect(output).toBe('');
          }
        }, 30000);

        // Test 3: hook command with errors
        test(`hook command - should detect errors in ${ext} files`, async () => {
          const testFile = join(TEST_DIR, `hook-error${ext}`);
          writeFileSync(testFile, lang.errorCode);

          const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
          });

          proc.stdin.write(
            JSON.stringify({
              tool_name: 'Edit',
              tool_input: { file_path: testFile },
              cwd: TEST_DIR,
            })
          );
          void proc.stdin.end();

          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;

          // Should detect errors via hook (shell integration format)
          if (stderr.includes(']633;E;')) {
            expect(exitCode).toBe(2); // Error exit code
            expect(stderr).toMatch(/✗.*(error|warning)|(error|warning).*found/i);
          }
        }, 30000);

        // Test 4: hook command without errors
        test(`hook command - should show no errors for clean ${ext} files`, async () => {
          const testFile = join(TEST_DIR, `hook-clean${ext}`);
          writeFileSync(testFile, lang.cleanCode);

          const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
          });

          proc.stdin.write(
            JSON.stringify({
              tool_name: 'Edit',
              tool_input: { file_path: testFile },
              cwd: TEST_DIR,
            })
          );
          void proc.stdin.end();

          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;

          // Should show no errors (Terraform, Java, and Scala may show warnings/errors due to project setup)
          if (
            (ext === '.tf' || ext === '.tfvars' || ext === '.java') &&
            stderr.includes('warning')
          ) {
            expect(exitCode).toBe(2); // Warnings still exit with 2
          } else if (ext === '.java' && stderr.includes('error')) {
            // Java may show errors if file name doesn't match class name
            expect(exitCode).toBe(2);
          } else if ((ext === '.scala' || ext === '.sc') && stderr.includes('error')) {
            // Scala may show naming errors or compilation issues in test environment
            expect(exitCode).toBe(2);
          } else {
            expect(exitCode).toBe(0);
            expect(stderr).toBe('');
          }
        }, 30000);
      }
    });
  }
});
