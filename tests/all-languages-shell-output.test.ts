import { describe, test, expect } from 'bun:test';
import { spawn } from 'child_process';

/**
 * Test that shell integration output works correctly for all supported languages
 */
describe('All Languages Shell Integration Output', () => {
  const languages = [
    { name: 'TypeScript', file: 'examples/typescript-project/src/index.ts', hasErrors: true },
    { name: 'Python', file: 'examples/python-project/main.py', hasErrors: true },
    { name: 'Go', file: 'examples/go-project/cmd/server/main.go', hasErrors: true },
    { name: 'Rust', file: 'examples/rust-project/src/main.rs', hasErrors: true },
    {
      name: 'Java',
      file: 'examples/java-project/src/main/java/com/example/User.java',
      hasErrors: true,
    },
    { name: 'C++', file: 'examples/cpp-project/src/User.cpp', hasErrors: true },
    { name: 'PHP', file: 'examples/php-project/src/User.php', hasErrors: true },
    { name: 'Lua', file: 'examples/lua-project/main.lua', hasErrors: true },
    { name: 'Elixir', file: 'examples/elixir-project/mix.exs', hasErrors: true },
    { name: 'Scala', file: 'examples/scala-project/src/main/scala/User.scala', hasErrors: false }, // No errors in example
    { name: 'Terraform', file: 'examples/terraform-project/main.tf', hasErrors: true },
  ];

  async function runCheck(file: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const proc = spawn('./bin/claude-lsp-cli', ['check', file], {
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });
    });
  }

  for (const lang of languages) {
    test(`${lang.name} should output shell integration format`, async () => {
      const result = await runCheck(lang.file);

      // Check for diagnostic output format
      const output = result.stdout || result.stderr;

      if (lang.hasErrors) {
        expect(output).toContain('✗');
        expect(output).toMatch(/\d+ (error|warning)/);
        // Should have detailed diagnostics
        expect(output).toMatch(/✗|⚠/);
      } else {
        // Should show "No issues found" for check command
        expect(output).toContain('No issues found');
      }

      // Errors are output to stderr for hooks, stdout for check command
    });
  }

  test('should handle multiple files with shell integration', async () => {
    // Test checking multiple files at once
    const files = ['examples/typescript-project/src/index.ts', 'examples/python-project/main.py'];

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
      (resolve) => {
        const proc = spawn('./bin/claude-lsp-cli', ['check', ...files], {
          cwd: process.cwd(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code: code || 0 });
        });
      }
    );

    // Check combined output from both streams
    const output = result.stdout || result.stderr;

    // Should show combined errors
    expect(output).toContain('✗');
    expect(output).toMatch(/\d+ errors/);

    // Should show diagnostics (may only show first file if > 5 errors)
    expect(output).toContain('index.ts');
    // Note: main.py may not appear if TypeScript has > 5 errors
  });
});
