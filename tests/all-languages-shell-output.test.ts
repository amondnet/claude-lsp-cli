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

      // Check for OSC 633 sequences
      expect(result.stderr).toContain('\x1b]633;A\x07'); // Start
      expect(result.stderr).toContain('\x1b]633;B\x07'); // Prompt end
      expect(result.stderr).toContain('\x1b]633;C\x07'); // Pre-execution
      expect(result.stderr).toContain('\x1b]633;E;'); // Command metadata

      if (lang.hasErrors) {
        // Should have error exit code
        expect(result.stderr).toContain('\x1b]633;D;1\x07');

        // Should have visible summary (unless it's just warnings)
        if (!result.stderr.includes('warning')) {
          expect(result.stderr).toMatch(/✗ \d+ error/);
        }

        // Should have file affected
        expect(result.stderr).toContain('Files affected:');

        // Should have detailed diagnostics in metadata
        expect(result.stderr).toContain('✗');
        expect(result.stderr).toMatch(/✗|⚠/);
      } else {
        // Should have success exit code
        expect(result.stderr).toContain('\x1b]633;D;0\x07');

        // Should be silent (no visible output)
        expect(result.stderr).not.toContain('✗');

        // Should have "No issues found" in metadata
        expect(result.stderr).toContain('claude-lsp-cli diagnostics: No issues found');
      }

      // Should have shell integration format if errors exist
      if (result.stderr.includes('✗')) {
        expect(result.stderr).toContain(']633;');
      }
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

    // Should have shell integration sequences
    expect(result.stderr).toContain('\x1b]633;A\x07');
    expect(result.stderr).toContain('\x1b]633;E;');
    expect(result.stderr).toContain('\x1b]633;D;');

    // Should show combined errors
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('errors');

    // Should list both files
    expect(result.stderr).toContain('src/index.ts');
    expect(result.stderr).toContain('main.py');
  });
});
