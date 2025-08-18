# Claude Code LSP

A Language Server Protocol (LSP) client that integrates with Claude Code to provide real-time diagnostics and language intelligence for multiple programming languages.

## 🎯 How It Works

This LSP server integrates with Claude Code through a **PostToolUse hook** that automatically checks your code after every edit, providing instant feedback about errors, warnings, and code issues directly in your Claude conversation.

## ✨ Features

- 🚀 **Multi-Language Support**: TypeScript/JavaScript and C/C++ fully working, Python partially working
- 🔍 **Real-time Diagnostics**: Automatic error checking after every code edit in Claude
- 🤖 **Claude Integration**: Seamless hook integration with Claude Code
- 📦 **Auto-install**: Automatically installs TypeScript and Python language servers
- 🎯 **Smart Detection**: Auto-detects project languages and starts appropriate servers
- ⚡ **Fast**: Built with Bun for optimal performance
- 🔒 **Secure**: Unix socket permissions (0600), path traversal protection, rate limiting
- 🎮 **CLI Management**: Status monitoring, server control, diagnostic queries
- 🔄 **Persistent Servers**: Servers stay running between Claude sessions for optimal performance
- 🛡️ **Enterprise-Ready**: Comprehensive security features and proper error handling

## 📊 Language Support Status

### ✅ Fully Working
- **TypeScript/JavaScript** - Full diagnostics, auto-installs
- **C/C++** - Full diagnostics (requires clangd installed)

### ⚠️ Partially Working  
- **Python (Pyright)** - Installs but may not detect all type errors

### 🔧 Configured but need fixes
- Go, Rust, Java, Ruby, PHP, and 20+ other languages have configuration but require additional work

## 📦 Prerequisites - Install Bun First!

Claude Code LSP is built with [Bun](https://bun.sh), a fast JavaScript runtime. You need to install Bun before proceeding:

### Installing Bun

#### macOS/Linux/WSL:

```bash
# Official installer (recommended)
curl -fsSL https://bun.sh/install | bash

# Alternative: Homebrew (macOS)
brew install oven-sh/bun/bun

# Alternative: npm (if you have Node.js)
npm install -g bun
```

#### Windows:

```powershell
# PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"

# Or use WSL and follow Linux instructions
```

#### Verify Installation:

```bash
bun --version
# Should output: 1.0.0 or higher
```

## 🚀 Installation

### Method 1: Using Claude Code (Recommended)

The easiest way is to let Claude install it for you:

```bash
# Clone the repository first
git clone https://github.com/teamchong/claude-code-lsp.git
cd claude-code-lsp

# Ask Claude to install it (non-interactive, grants access to ~/.claude)
claude --add-dir ~/.claude -p \
  "Please install the LSP diagnostics hook by:
  1. Copying hooks/lsp-diagnostics.ts to ~/.claude/hooks/
  2. Making it executable (chmod +x)
  3. Updating ~/.claude/settings.json to add the PostToolUse hook
  4. Running bun install to install dependencies"
```

Claude will handle the installation and any updates automatically!

### Method 2: Automated Script

```bash
curl -fsSL https://raw.githubusercontent.com/teamchong/claude-code-lsp/master/install-claude-hook.sh | bash
```

This script:

1. **Installs the LSP server** to `~/.claude/claude-code-lsp/`
2. **Creates a hook** at `~/.claude/hooks/lsp-diagnostics.ts`
3. **Updates your Claude settings** to enable the hook
4. **Checks for installed language servers** and provides installation commands

### Method 3: Manual Installation

For full control over the installation:

1. Clone to Claude directory:

```bash
cd ~/.claude
git clone https://github.com/teamchong/claude-code-lsp.git
cd claude-code-lsp
bun install
```

2. Create the hook:

```bash
mkdir -p ~/.claude/hooks
cp hooks/lsp-diagnostics.ts ~/.claude/hooks/
chmod +x ~/.claude/hooks/lsp-diagnostics.ts
```

3. Build the binaries (optional but recommended):

```bash
bun run build
```

This creates `bin/claude-lsp-cli` and `bin/claude-lsp-server`.

4. Configure Claude Code settings - add to your `~/.claude/settings.json`:

**Recommended Configuration** (only runs on tools that can modify files):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "(Write|Edit|Update|MultiEdit|Bash)",
        "hooks": [
          {
            "type": "command", 
            "command": "~/Downloads/repos/claude-code-lsp/bin/claude-lsp-cli hook PostToolUse"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/Downloads/repos/claude-code-lsp/bin/claude-lsp-cli hook SessionStart"
          }
        ]
      }
    ]
  }
}
```

This configuration:
- **PostToolUse** with matcher: Only runs on tools that can modify files (Write/Edit/Bash/etc.)
- **SessionStart**: Checks initial project state when Claude starts  
- **No Stop hook**: Servers persist between sessions for optimal performance
- **Efficient filtering**: Skips Read, WebFetch, Grep and other read-only tools

## 🔒 Security Features

The LSP server uses Unix socket permissions for secure local-only access:

- **🔐 Unix Socket Security**: File system permissions (0600) provide access control
- **🛡️ Path Traversal Protection**: Validates all file paths stay within project boundaries  
- **⚡ Rate Limiting**: 100 requests per minute per connection to prevent DoS
- **📁 Secure Socket Location**: Uses platform-appropriate runtime directories
- **🚨 Command Injection Prevention**: No shell execution with user input
- **🧹 Process Cleanup**: Automatic cleanup of resources on shutdown
- **📝 Comprehensive Logging**: Structured JSON logging with log levels

### How Security Works

1. **Unix Socket Permissions**: The LSP server uses Unix domain sockets with strict file permissions:
   - Socket created with `0600` permissions (owner read/write only)
   - Parent directory has `0700` permissions (owner-only access)
   - No authentication tokens needed - the OS handles access control

2. **Socket Locations**:
   - **macOS**: `~/Library/Application Support/claude-lsp/run/claude-lsp-{projectHash}.sock`
   - **Linux**: `$XDG_RUNTIME_DIR/claude-lsp-{projectHash}.sock` or `~/.claude-lsp/run/`
   - **Windows**: Not yet supported (would use named pipes)

3. **Data Storage**:
```bash
# Diagnostic history database:
~/.claude/data/claude-code-lsp.db

# Runtime files (macOS example):
~/Library/Application Support/claude-lsp/run/
├── claude-lsp-{projectHash}.sock   # Unix socket (0600)
├── claude-lsp-{projectHash}.pid    # Process ID file
└── claude-lsp-{projectHash}.start  # Start timestamp
```

4. **API Access**:
```bash
# Direct access via Unix socket (no authentication needed)
curl --unix-socket /path/to/socket.sock http://localhost/diagnostics

# The socket permissions prevent unauthorized access
ls -la ~/Library/Application\ Support/claude-lsp/run/*.sock
# -rw------- 1 user user 0 Jan 18 10:00 claude-lsp-abc123.sock
```

**Security Benefits**:
- No tokens to leak or manage
- No passwords in configuration files
- OS-enforced access control
- Follows industry best practices (Docker, PostgreSQL use same pattern)

## 📋 Supported Languages

| Language              | Auto-Install | Manual Install Command                                                                                                                                                                      |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | ✅           | Automatic with bun                                                                                                                                                                          |
| Python                | ✅           | `bun add pyright`                                                                                                                                                                           |
| Rust                  | ❌           | Manual install from [rust-analyzer releases](https://github.com/rust-lang/rust-analyzer/releases) |
| Go                    | ❌           | `go install golang.org/x/tools/gopls@latest`                                                                                                                                                |
| Java                  | ❌           | `brew install jdtls`                                                                                                                                                                        |
| C/C++                 | ❌           | `brew install llvm` (macOS) or `apt install clangd` (Linux)                                                                                                                                 |
| Ruby                  | ❌           | `gem install solargraph`                                                                                                                                                                    |
| PHP                   | ✅           | `bun add intelephense`                                                                                                                                                                      |
| HTML/CSS              | ✅           | Automatic with bun                                                                                                                                                                          |
| JSON/YAML             | ✅           | Automatic with bun                                                                                                                                                                          |
| Vue/Svelte            | ✅           | Automatic with bun                                                                                                                                                                          |
| Docker                | ❌           | `npm install -g dockerfile-language-server-nodejs`                                                                                                                                          |
| Bash                  | ❌           | `npm install -g bash-language-server`                                                                                                                                                       |
| And 14 more...        |              | See [docs/LANGUAGE_SUPPORT.md](docs/LANGUAGE_SUPPORT.md)                                                                                                                                    |

## 🎮 How to Use

Once installed, the LSP hook automatically activates when you use Claude Code:

1. **Edit any code file** in Claude Code
2. **The hook automatically checks your code** after each edit
3. **See diagnostics appear** as system messages in your conversation
4. **Claude will acknowledge and fix issues** automatically

### Example Workflow

```
You: "Create a TypeScript function to calculate fibonacci"
Claude: [Creates code with a type error]
System: [LSP diagnostics appear showing the type error]
Claude: "I see there's a type error on line 5. Let me fix that..."
[Claude automatically fixes the issue]
```

## 🛠️ Standalone Usage (Without Claude)

### As an HTTP Server

```bash
# Start the enhanced server with all language support
bun start

# Or start the basic TypeScript/Python server
bun start:basic
```

API Endpoints:

- `GET /diagnostics` - Get all diagnostics
- `GET /diagnostics?file=path/to/file` - Get diagnostics for specific file
- `GET /languages` - List supported languages and installation status
- `GET /servers` - Show active language servers
- `POST /install` - Install a language server
- `POST /check` - Check a specific file

### As a Library

```typescript
import { LSPClient } from "claude-code-lsp";

const client = new LSPClient();

// Auto-detect and start all relevant servers
await client.autoDetectAndStart(process.cwd());

// Open a file - server starts automatically if needed
await client.openDocument("./src/main.ts");

// Get diagnostics
const diagnostics = client.getDiagnostics("./src/main.ts");
console.log(`Found ${diagnostics.length} issues`);
```

## 🎮 CLI Management Commands

The `claude-lsp-cli` provides management commands for monitoring and controlling LSP servers:

### Server Status and Control

```bash
# Show all running LSP servers
claude-lsp-cli status

# Start LSP server for a specific project
claude-lsp-cli start /path/to/project

# Stop LSP server for a specific project  
claude-lsp-cli stop /path/to/project

# Kill all running LSP servers
claude-lsp-cli kill-all
```

### Diagnostics and Debugging

```bash
# Get all diagnostics for a project
claude-lsp-cli diagnostics /path/to/project

# Get diagnostics for a specific file
claude-lsp-cli diagnostics /path/to/project src/main.ts

# Show help
claude-lsp-cli help
```

### Example Output

```bash
$ claude-lsp-cli status
Running LSP servers:
  a1b2c3d4e5f6789a: healthy (uptime: 3600s)
  9f8e7d6c5b4a321f: healthy (uptime: 1200s)

$ claude-lsp-cli start ~/my-project
Starting LSP server for project: /Users/user/my-project
LSP server started (PID: 12345)

$ claude-lsp-cli diagnostics ~/my-project
Found 3 diagnostics:
  src/main.ts:15:5 - error - Cannot find name 'undefinedVar'
  src/utils.ts:8:12 - warning - Variable 'temp' is assigned but never used
  src/types.ts:23:1 - info - Missing semicolon
```

## 🔧 Configuration

### Environment Variables

```bash
# For standalone server
LSP_PORT=3939              # HTTP server port
PROJECT_ROOT=/path/to/project
DEBUG=true                  # Enable debug logging
AUTO_INSTALL=true           # Auto-install language servers
```

### Claude Settings

The hook is configured in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": ["~/.claude/hooks/lsp-diagnostics.ts"]
  }
}
```

## 🐛 Troubleshooting

### Hook Not Working

1. Check if hook is installed:

```bash
ls -la ~/.claude/hooks/lsp-diagnostics.ts
```

2. Verify settings.json:

```bash
cat ~/.claude/settings.json | grep -A2 hooks
```

3. Check if LSP server is installed:

```bash
ls -la ~/.claude/claude-code-lsp/
```

### Language Server Not Starting

1. Check installation status:

```bash
cd ~/.claude/claude-code-lsp
bun run src/enhanced-server.ts
# Then visit http://localhost:3939/languages
```

2. Install missing servers using the commands from the table above

### Diagnostics Not Appearing

- Wait 1-2 seconds after code edits
- Check that the file extension is supported
- Ensure the language server is installed

## 📚 Documentation

- [Language Support Guide](docs/LANGUAGE_SUPPORT.md) - Detailed language server information
- [API Documentation](docs/API.md) - HTTP API reference
- [Hook Development](docs/HOOKS.md) - Creating custom Claude Code hooks

## 🤝 Contributing

Contributions are welcome! To add support for a new language:

1. Add the configuration to `src/language-servers.ts`
2. Test the language server
3. Update the documentation
4. Submit a pull request

## 📄 License

MIT - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh) for maximum performance
- Integrates with [Claude Code](https://claude.ai) through hooks
- Uses the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- Supports language servers from Microsoft, Google, JetBrains, and the open-source community
