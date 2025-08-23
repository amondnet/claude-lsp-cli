# Claude Code LSP

A Language Server Protocol (LSP) client that integrates with Claude Code to provide real-time diagnostics and language intelligence for multiple programming languages.

## 🎯 How It Works

This LSP server integrates with Claude Code through a **PostToolUse hook** that automatically checks your code after every edit, providing instant feedback about errors, warnings, and code issues directly in your Claude conversation.

## ✨ Features

- 🚀 **Multi-Language Support**: 9 languages working (TypeScript, JavaScript, Go, C++, PHP, Scala, Rust, Lua, Terraform)
- 🔍 **Real-time Diagnostics**: Automatic error checking after every code edit in Claude
- 🤖 **Claude Integration**: Seamless hook integration with Claude Code
- 📦 **Auto-install**: Automatically installs TypeScript and PHP language servers
- 🎯 **Smart Detection**: Auto-detects project languages and starts appropriate servers
- ⚡ **Fast**: Built with Bun for optimal performance
- 🔒 **Secure**: Unix socket permissions (0600), path traversal protection, rate limiting
- 🎮 **CLI Management**: Status monitoring, server control, diagnostic queries
- 🔄 **Persistent Servers**: Servers stay running between Claude sessions for optimal performance
- 🛡️ **Enterprise-Ready**: Comprehensive security features and proper error handling

## 📊 Language Support Status (11/13 Tested - 85% Success Rate)

### ✅ Working Languages (11 languages) - Tested and Confirmed
- **TypeScript** - Full diagnostics, auto-installs, excellent performance ✓
- **JavaScript** - Full diagnostics via TypeScript server, works out of box ✓
- **Python** - Full diagnostics via pylsp (mypy, pyflakes, pycodestyle) ✓
- **Rust** - Full diagnostics (requires rust-analyzer installed) ✓
- **Go** - Full diagnostics (requires `go install golang.org/x/tools/gopls@latest`) ✓
- **Java** - Full diagnostics via jdtls (requires `brew install jdtls`) ✓
- **C/C++** - Full diagnostics (requires clangd installed) ✓
- **Ruby** - ❌ Not working (solargraph integration issues)
- **PHP** - Full diagnostics (auto-installs Intelephense) ✓
- **Scala** - Full diagnostics (requires `cs install metals`) ✓
- **Lua** - Full diagnostics (install via `mise install lua-language-server`) ✓
- **Elixir** - ❌ Not working (path configuration issues)
- **Terraform** - Partial diagnostics (install via `mise install terraform-ls`) ✓


## 📦 Prerequisites

### 1. Install Bun (Required)

Claude Code LSP is built with [Bun](https://bun.sh), a fast JavaScript runtime:

```bash
# macOS/Linux/WSL
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

### Step 1: Clone the Repository

```bash
cd ~/.claude
git clone https://github.com/teamchong/claude-code-lsp.git
cd claude-code-lsp
```

### Step 2: Run the Installation Script

```bash
./install.sh
```

This script will:
- Clean up any existing LSP processes
- Build compiled binaries with embedded Bun runtime
- Install binaries to `~/.local/bin/`
- Provide instructions for configuring Claude Code

### Step 3: Configure Claude Code

After installation, run Claude Code with the required directories:

```bash
claude --add-dir ~/.claude --add-dir ~/.local/bin
```

Then ask Claude to configure the system:

```
"Please help me set up the Claude Code LSP diagnostics system:

1. First, update my ~/.claude/settings.json to include these LSP hooks:
   - PreToolUse: claude-lsp-cli hook PreToolUse
   - PostToolUse: claude-lsp-cli hook PostToolUse
   
2. Then, add the Diagnostics & Self-Correction Protocol to my ~/.claude/CLAUDE.md
   file. This protocol teaches you how to handle [[system-message]] diagnostic
   reports.

Please set up both the hooks in settings.json and the protocol in CLAUDE.md."
```

Claude will handle the installation based on the install.sh script!

### Alternative: Quick Install via curl

For a one-line installation (requires git to be installed):

```bash
curl -fsSL https://raw.githubusercontent.com/teamchong/claude-code-lsp/master/install.sh | bash
```

### Manual Installation

For full control over the installation:

1. Clone to Claude directory:

```bash
cd ~/.claude
git clone https://github.com/teamchong/claude-code-lsp.git
cd claude-code-lsp
bun install
bun run build
```

2. Configure Claude Code settings - add to your `~/.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "env": {
    "CLAUDE_LSP_SERVER_PATH": "~/.claude/claude-code-lsp/bin/claude-lsp-server",
    "CLAUDE_LSP_CLI_PATH": "~/.claude/claude-code-lsp/bin/claude-lsp-cli"
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "(Write|Edit|Update|MultiEdit)",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_LSP_CLI_PATH} hook PostToolUse"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_LSP_CLI_PATH} hook SessionStart"
          }
        ]
      }
    ]
  }
}
```

This configuration:
- **Environment variables**: Set paths to the binaries
- **PostToolUse**: Only runs on tools that can modify files (Write/Edit/etc.)
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
| Python                | ✅           | `pip install python-lsp-server`                                                                                                                                                             |
| Rust                  | ❌           | Usually installed with rustup: `rustup component add rust-analyzer` |
| Go                    | ❌           | `go install golang.org/x/tools/gopls@latest`                                                                                                                                                |
| Java                  | ❌           | `brew install jdtls`                                                                                                                                                                        |
| C/C++                 | ❌           | `brew install llvm` (macOS) or `apt install clangd` (Linux)                                                                                                                                 |
| Ruby                  | ❌           | `gem install solargraph`                                                                                                                                                                    |
| PHP                   | ✅           | `bun add intelephense`                                                                                                                                                                      |
| Scala                 | ❌           | `cs install metals` (requires [Coursier](https://get-coursier.io/docs/cli-installation))                                                                                                    |
| HTML/CSS              | ✅           | Automatic with bun                                                                                                                                                                          |
| JSON/YAML             | ✅           | Automatic with bun                                                                                                                                                                          |
| Vue/Svelte            | ✅           | Automatic with bun                                                                                                                                                                          |
| Docker                | ❌           | `npm install -g dockerfile-language-server-nodejs`                                                                                                                                          |
| Bash                  | ❌           | `npm install -g bash-language-server`                                                                                                                                                       |
| Lua                   | ❌           | `mise install lua-language-server@latest && mise use -g lua-language-server@latest`                                                                                                         |
| Terraform             | ❌           | `mise install terraform-ls@latest && mise use -g terraform-ls@latest`                                                                                                                       |
| Elixir                | ❌           | `mise install elixir-ls@latest` (path issues - not fully working)                                                                                                                           |
| And 10 more...        |              | See [docs/LANGUAGE_SUPPORT.md](docs/LANGUAGE_SUPPORT.md)                                                                                                                                    |

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

## 🔧 How It Works

The LSP hook communicates with Claude using a **system message protocol** that requires proper configuration in your CLAUDE.md file.

### The System Message Protocol

The hook outputs specially formatted messages that Claude recognizes:

```javascript
console.error(`[[system-message]]: ${JSON.stringify({
  status: 'diagnostics_report',
  result: 'errors_found',
  diagnostics: [...],
  reference: { type: 'previous_code_edit', turn: 'claude_-1' }
})}`);
```

### Setting Up Claude's Understanding

For Claude to properly handle diagnostics, add this to your `~/.claude/CLAUDE.md` file:

```markdown
### System Message Format

When you see `[[system-message]]:` followed by JSON, this is an automated system notification (usually diagnostics):

**DIAGNOSTIC REPORT FORMAT:**

{
  "status": "diagnostics_report",
  "result": "errors_found" | "all_clear",
  "reference": {
    "type": "previous_code_edit", 
    "turn": "claude_-1"
  },
  "diagnostics": [    // Only present when result is "errors_found"
    {
      "file": "/absolute/path/to/file.ts",
      "line": 10,
      "column": 5,
      "severity": "error" | "warning",  // Only errors and warnings are reported
      "message": "Type 'string' is not assignable to type 'number'",
      "source": "TypeScript",
      "ruleId": "TS2322"  // Optional: error code if available
    }
  ]
}
```

This teaches Claude to:
1. **Recognize diagnostic reports** with `"status": "diagnostics_report"`
2. **Prioritize fixing errors** before continuing with new requests
3. **Parse the diagnostic format** and fix issues at correct locations
4. **Follow the correction protocol** automatically

## 🛠️ Standalone Usage (Without Claude)

### As an HTTP Server

```bash
# Start the enhanced server with all language support
bun start

# Or start the basic TypeScript server
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
