# Claude Code LSP

A Language Server Protocol (LSP) client that integrates with Claude Code to provide real-time diagnostics and language intelligence for multiple programming languages.

## 🎯 How It Works

This LSP server integrates with Claude Code through a **PostToolUse hook** that automatically checks your code after every edit, providing instant feedback about errors, warnings, and code issues directly in your Claude conversation.

## 🔍 How Project Detection Works

The LSP client automatically detects your project root using a smart algorithm:

1. **Starts from the edited file's directory** and walks UP the directory tree
2. **Looks for version control markers** (primary indicator):
   - `.git` (Git)
   - `.hg` (Mercurial)  
   - `.svn` (Subversion)
3. **Also checks for language-specific files**:
   - **TypeScript/JavaScript**: `tsconfig.json`, `package.json`
   - **Python**: `setup.py`, `pyproject.toml`, `requirements.txt`, `.venv`, `Pipfile`
4. **Scans common subdirectories** (`ui/`, `frontend/`, `backend/`, `api/`, `web/`, `server/`, `client/`)
5. **Returns the FIRST directory with version control** as the project root
6. **Falls back to directory with language files** if no version control found

### Important Notes

- **One project per detection**: Only finds the first/nearest project root
- **Walks UP only**: Starts from file location and goes up to find root
- **Version control wins**: `.git` directory takes precedence over language files
- **Works from any file**: Edit any file in the project, it finds the root

### Example Project Structure

```
~/my-project/           # <- Project root (has .git)
├── .git/              # <- Version control marker (detected!)
├── package.json       # <- Also detected for TypeScript
├── src/
│   └── index.ts      # <- Edit this file
└── backend/
    ├── requirements.txt  # <- Python detected in subdir
    └── main.py
```

When you edit `src/index.ts`, the LSP:
1. Starts at `~/my-project/src/`
2. Walks up to `~/my-project/`
3. Finds `.git` and `package.json`
4. Uses `~/my-project/` as the project root

## 🔄 Multi-Project Detection

**IMPORTANT**: The PostToolUse hook cannot determine which specific file was edited due to Claude Code's architecture. Therefore, the system uses a comprehensive approach:

### How It Works:
1. **Tool executes** (Edit, Bash, Grep, etc.) - triggers PostToolUse hook
2. **System receives only `cwd`** - current working directory, NOT the file path
3. **Discovers ALL projects** in the workspace using `findAllProjects()`
4. **Scans each project** for language-specific files and diagnostics
5. **Aggregates results** from all language servers

### Key Behaviors:
- **Broad scanning**: Checks entire workspace since we can't target specific files
- **Multi-project support**: Handles monorepos and multiple project directories
- **Language detection**: Each project gets its own language servers based on detected files
- **Efficient batching**: Opens files in small batches to avoid overwhelming language servers

### Example Multi-Project Workspace:
```
~/workspace/
├── frontend/           # <- React/TypeScript project
│   ├── package.json
│   └── src/
├── backend/           # <- Python project  
│   ├── requirements.txt
│   └── api/
└── infrastructure/    # <- Terraform project
    └── main.tf
```

When ANY tool runs in this workspace, the system:
1. Detects 3 separate projects
2. Starts TypeScript, Python, and Terraform language servers
3. Scans all relevant files in each project
4. Reports diagnostics from any project with issues

## 🧠 Smart Deduplication System

To prevent spam while ensuring you see important changes, the system uses **server-side deduplication**:

### Architecture:

1. **Server-Side Processing**: LSP server handles all deduplication logic
   - Receives raw diagnostics from language servers
   - Processes through deduplication system
   - Returns max 5 display-ready diagnostics

2. **Hook-Side Simplicity**: PostToolUse hook just reports what server returns
   - No complex deduplication logic in hook
   - Clean separation of concerns

### How Deduplication Works:

1. **Diagnostic Fingerprinting**: Each diagnostic gets a unique key based on:
   - File path + line + column + severity + message + source

2. **SQLite Database Storage**: Server tracks diagnostic history per project:
   - First seen timestamp
   - Last seen timestamp  
   - Display history

3. **Server Processing Logic**:
   - a. **Remove old items** not in new results
   - b. **Update timestamps** for items still present  
   - c. **Map to latest 5 items** for display
   - d. **Add displayed items** to dedup list (non-displayed stay out for next time)

4. **Memory Window**: **10 minutes** (configurable)
   - After 10 minutes, resolved issues can be reported again if they reappear
   - Prevents long-term spam while allowing periodic reminders

### Server Response Format:
```json
{
  "diagnostics": [
    {
      "file": "/path/to/file.ts",
      "line": 10,
      "column": 5,
      "severity": "error",
      "message": "Type 'string' is not assignable to type 'number'",
      "source": "typescript",
      "ruleId": "2322"
    }
    // ... max 5 items returned
  ],
  "timestamp": "2025-08-25T20:00:00.000Z"
}
```

### Cache Management:
- **Database location**: `~/.claude/data/claude-code-lsp.db`
- **Clear cache**: `rm -f ~/.claude/data/claude-code-lsp.db`
- **Memory window**: 10 minutes (recently reduced from 4 hours)

## ⚠️ Architectural Limitations

### File Change Detection

**The system cannot detect which specific file was edited.** This is a fundamental limitation of Claude Code's hook architecture:

#### What We Get:
- ✅ `cwd` (current working directory)
- ✅ `tool_name` (Edit, Bash, etc.)
- ✅ `session_id` and basic metadata

#### What We DON'T Get:
- ❌ Which files were modified
- ❌ What changes were made

#### Implications:
- **Cannot send targeted `didChange` notifications** to language servers
- **Must scan entire workspace** to catch changes
- **LSP servers may cache stale content** from disk
- **Less efficient** than file-specific updates

#### Workarounds:
1. **Reset server cache**: `claude-lsp-cli reset /path/to/project` - Fast, graceful refresh (recommended)
2. **Kill stale servers**: `claude-lsp-cli kill-all` - Nuclear option if reset fails
3. **Comprehensive scanning**: Check all projects to ensure nothing is missed
4. **Smart deduplication**: Prevent spam from repeated scans

### PostToolUse Hook Behavior
- **No file path information**: All tools provide only `cwd` and `tool_name`
- **Workspace-wide scanning**: Necessary due to lack of targeted information

## ✨ Features

- 🚀 **Multi-Language Support**: 13 languages working (TypeScript, JavaScript, Python, Go, Java, C++, Ruby, PHP, Scala, Rust, Lua, Elixir, Terraform)
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

### ✅ Working Languages (13 languages) - Tested and Confirmed
- **TypeScript** - Full diagnostics, auto-installs, excellent performance ✓
- **JavaScript** - Full diagnostics via TypeScript server, works out of box ✓
- **Python** - Full diagnostics via pylsp (mypy, pyflakes, pycodestyle) ✓
- **Rust** - Full diagnostics (requires rust-analyzer installed) ✓
- **Go** - Full diagnostics (requires `go install golang.org/x/tools/gopls@latest`) ✓
- **Java** - Full diagnostics via jdtls (requires `brew install jdtls`) ✓
- **C/C++** - Full diagnostics (requires clangd installed) ✓
- **Ruby** - Full diagnostics via Solargraph (requires `gem install solargraph` and `.solargraph.yml` config) ✓
- **PHP** - Full diagnostics (auto-installs Intelephense) ✓
- **Scala** - Full diagnostics (requires `cs install metals`) ✓
- **Lua** - Full diagnostics (install via `mise install lua-language-server`) ✓
- **Elixir** - Full diagnostics via Elixir LS (requires `mise install elixir-ls`) ✓
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

Add the Diagnostics & Self-Correction Protocol to my ~/.claude/CLAUDE.md
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
    ]
  }
}
```

This configuration:
- **Environment variables**: Set paths to the binaries
- **PostToolUse**: Only runs on tools that can modify files (Write/Edit/etc.)
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
// When diagnostics are found:
console.error(`[[system-message]]: ${JSON.stringify({
  diagnostics: [...],
  summary: "total: 5 diagnostics (typescript: 3, python: 2)"
})}`);

// When no issues found:
console.error(`[[system-message]]: ${JSON.stringify({
  summary: "no warnings or errors"
})}`);
```

### Setting Up Claude's Understanding

For Claude to properly handle diagnostics, add this to your `~/.claude/CLAUDE.md` file:

```markdown
### System Message Format

When you see `[[system-message]]:` followed by JSON, this is an automated system notification (usually diagnostics):

**DIAGNOSTIC REPORT FORMAT:**

**When errors found:**
```json
{
  "diagnostics": [
    {
      "file": "/absolute/path/to/file.ts",
      "line": 10,
      "column": 5,
      "severity": "error" | "warning",  // Only errors and warnings are reported (hints filtered out)
      "message": "Type 'string' is not assignable to type 'number'",
      "source": "TypeScript" | "ESLint" | "Python" | "Rust" | etc,
      "ruleId": "TS2322"  // Optional: error code if available
    }
  ],
  "summary": "total: 25 diagnostics (typescript: 20, python: 5)"  // Shows full scope when displaying max 5
}
```

**When no errors:**
```json
{
  "summary": "no warnings or errors"
}
```

This teaches Claude to:
1. **Recognize diagnostic reports** by the system message format
2. **Prioritize fixing errors** when diagnostics array is present
3. **Parse the diagnostic format** and fix issues at correct locations  
4. **Understand summary information** showing total diagnostics by language
5. **Handle "no warnings or errors" status** when no issues are found

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
