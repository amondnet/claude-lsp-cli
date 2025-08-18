# Contributing to Claude Code LSP

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/claude-code-lsp.git
   cd claude-code-lsp
   ```

2. **Install Bun**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Install dependencies**
   ```bash
   bun install
   ```

4. **Run tests**
   ```bash
   bun test
   ```

## Adding a New Language

To add support for a new language:

1. **Add configuration to `src/language-servers.ts`**:
   ```typescript
   newlang: {
     name: "NewLang",
     command: "newlang-server",
     args: ["--stdio"],
     installCommand: "npm install -g newlang-server",
     installCheck: "newlang-server",
     projectFiles: ["newlang.config.js"],
     extensions: [".nl"],
     requiresGlobal: true
   }
   ```

2. **Add tests in `tests/test-languages.ts`**:
   ```typescript
   test("detects NewLang project", () => {
     writeFileSync(join(testDir, "newlang.config.js"), "");
     const detected = detectProjectLanguages(testDir);
     expect(detected).toContain("newlang");
   });
   ```

3. **Update documentation**:
   - Add to README.md supported languages table
   - Update docs/LANGUAGE_SUPPORT.md

4. **Test your changes**:
   ```bash
   bun test
   bun run src/cli.ts detect
   ```

## Code Style

- Use TypeScript
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Test on multiple platforms if possible

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. Make your changes and commit:
   ```bash
   git commit -m "feat: add amazing feature"
   ```

3. Push to your fork:
   ```bash
   git push origin feature/amazing-feature
   ```

4. Open a Pull Request with:
   - Clear description of changes
   - Link to related issues
   - Screenshots if UI changes

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test additions or changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

## Language Server Development Tips

### Testing Language Servers Locally

1. **Manual testing**:
   ```bash
   # Start server
   bun run start
   
   # In another terminal, test endpoints
   curl http://localhost:3939/languages
   curl http://localhost:3939/diagnostics
   ```

2. **Debug mode**:
   ```bash
   DEBUG=true bun run dev
   ```

3. **Test specific language**:
   ```bash
   bun run src/cli.ts -i typescript
   bun run src/cli.ts -c test.ts
   ```

### Common Issues

- **Server not starting**: Check if language server binary is in PATH
- **No diagnostics**: Wait 1-2 seconds after file open
- **Installation fails**: Check network and permissions

## Questions?

Open an issue on GitHub or reach out in discussions!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.