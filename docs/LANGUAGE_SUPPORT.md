# Language Support Guide

## Currently Supported Languages

### TypeScript/JavaScript
- **Server**: typescript-language-server
- **Config files**: tsconfig.json, package.json
- **Installation**: `bun add typescript-language-server`

### Python
- **Server**: Pyright
- **Config files**: pyproject.toml, setup.py, requirements.txt
- **Installation**: `bun add pyright`

## Adding New Language Support

To add support for additional languages, you need to:

1. Install the language server package
2. Add a new method in `claude-code-lsp.ts`
3. Update server detection in `server.ts`

### Available Language Servers

Here are popular language servers you can add:

#### Rust
```bash
bun add rust-analyzer
```
```typescript
async startRustServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("rust-analyzer", [], {
    cwd: rootPath
  });
  // ... initialization code
}
```

#### Go
```bash
# Install gopls globally
go install golang.org/x/tools/gopls@latest
```
```typescript
async startGoServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("gopls", [], {
    cwd: rootPath
  });
  // ... initialization code
}
```

#### Java
```bash
# Download Eclipse JDT Language Server
# https://download.eclipse.org/jdtls/
```
```typescript
async startJavaServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("java", [
    "-jar", "/path/to/jdtls/plugins/org.eclipse.equinox.launcher_*.jar",
    "-configuration", "/path/to/jdtls/config",
    "-data", rootPath
  ]);
  // ... initialization code
}
```

#### C/C++
```bash
# Install clangd
brew install llvm  # macOS
# or
apt-get install clangd  # Ubuntu
```
```typescript
async startCppServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("clangd", [], {
    cwd: rootPath
  });
  // ... initialization code
}
```

#### Ruby
```bash
gem install solargraph
```
```typescript
async startRubyServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("solargraph", ["stdio"], {
    cwd: rootPath
  });
  // ... initialization code
}
```

#### PHP
```bash
bun add intelephense
```
```typescript
async startPhpServer(rootPath: string): Promise<void> {
  const serverProcess = spawn("bun", ["x", "intelephense", "--stdio"], {
    cwd: rootPath
  });
  // ... initialization code
}
```

#### HTML/CSS/JSON
```bash
bun add vscode-html-languageserver-bin
bun add vscode-css-languageserver-bin
bun add vscode-json-languageserver-bin
```

#### Vue/React/Svelte
```bash
bun add @volar/vue-language-server  # Vue
bun add @typescript/language-service  # React (via TS)
bun add svelte-language-server  # Svelte
```

#### Swift
```bash
# Install sourcekit-lsp (comes with Xcode)
xcrun sourcekit-lsp
```

#### Kotlin
```bash
# Download Kotlin Language Server
# https://github.com/fwcd/kotlin-language-server
```

#### Zig
```bash
# Install zls
brew install zls  # macOS
```

## Implementation Example

Here's how to add Rust support:

1. **Update package.json dependencies**:
```json
{
  "dependencies": {
    "rust-analyzer": "^0.3.0"
  }
}
```

2. **Add to claude-code-lsp.ts**:
```typescript
async startRustServer(rootPath: string): Promise<void> {
  console.log("Starting Rust Analyzer...");
  
  if (!existsSync(join(rootPath, "Cargo.toml"))) {
    console.log("No Cargo.toml found, skipping Rust server");
    return;
  }

  const serverProcess = spawn("rust-analyzer", [], {
    cwd: rootPath,
    env: { ...process.env }
  });

  const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(serverProcess.stdout!),
    new rpc.StreamMessageWriter(serverProcess.stdin!)
  );

  connection.onNotification("textDocument/publishDiagnostics", (params: any) => {
    this.handleDiagnostics(params.uri, params.diagnostics);
  });

  connection.listen();

  // Initialize with same pattern as TypeScript/Python
  // ... initialization code
}
```

3. **Update server.ts auto-detection**:
```typescript
// Check for Rust
if (existsSync(join(root, "Cargo.toml"))) {
  console.log(`Found Rust project at: ${root}`);
  await this.client.startRustServer(root);
}
```

## Language Detection Patterns

| Language | Detection Files | Priority |
|----------|----------------|----------|
| TypeScript | tsconfig.json, package.json | High |
| Python | pyproject.toml, setup.py, requirements.txt | High |
| Rust | Cargo.toml | High |
| Go | go.mod, go.sum | High |
| Java | pom.xml, build.gradle, .classpath | Medium |
| C/C++ | CMakeLists.txt, Makefile, compile_commands.json | Medium |
| Ruby | Gemfile, .rubocop.yml | Medium |
| PHP | composer.json | Medium |
| Swift | Package.swift | Low |
| Kotlin | build.gradle.kts | Low |

## Performance Considerations

- Start only necessary language servers
- Implement lazy loading for language servers
- Use file watching to detect when to start new servers
- Implement server pooling for multiple projects
- Add timeout/retry logic for server initialization

## Testing Language Servers

```bash
# Test individual language server
bun test tests/test-rust.ts
bun test tests/test-go.ts

# Test all language servers
bun test
```