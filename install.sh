#!/bin/bash

# Claude Code LSP Installer
# Installs Claude Code LSP following standard Unix conventions

set -e

INSTALL_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/claude-lsp"
DATA_DIR="$HOME/.local/share/claude-lsp"
CLAUDE_CONFIG="$HOME/.claude/settings.json"

echo "🚀 Claude Code LSP Installer"
echo "============================"
echo ""

# Check dependencies
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    echo "   Then restart your terminal and run this script again."
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Create standard directories
echo "📁 Creating standard directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR" 
mkdir -p "$DATA_DIR"

# Clone source to temp directory
echo "📦 Downloading Claude Code LSP..."
TEMP_DIR=$(mktemp -d)
git clone --depth 1 https://github.com/teamchong/claude-code-lsp.git "$TEMP_DIR"
cd "$TEMP_DIR"

# Build binaries
echo "🔨 Building binaries..."
bun install
bun run build

# Check if binaries were created
if [ ! -f "bin/claude-lsp-cli" ] || [ ! -f "bin/claude-lsp-server" ]; then
    echo "❌ Failed to build binaries"
    exit 1
fi

# Install binaries to standard location
echo "📋 Installing binaries..."
cp bin/claude-lsp-cli "$INSTALL_DIR/"
cp bin/claude-lsp-server "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/claude-lsp-cli"
chmod +x "$INSTALL_DIR/claude-lsp-server"

# Install data files
echo "📄 Installing data files..."
cp -r src examples "$DATA_DIR/"

echo "✅ Binaries installed successfully"
echo "   CLI: $INSTALL_DIR/claude-lsp-cli"
echo "   Server: $INSTALL_DIR/claude-lsp-server"

# Add to PATH if not already there
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "🔗 Adding $INSTALL_DIR to PATH..."
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc" 2>/dev/null || true
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
    echo "   Please restart your terminal or run: export PATH=\"$HOME/.local/bin:\$PATH\""
fi

# Configure Claude Code hooks (standard approach)
echo "🔧 Configuring Claude Code hooks..."
if [ ! -f "$CLAUDE_CONFIG" ]; then
    mkdir -p "$(dirname "$CLAUDE_CONFIG")"
    cat > "$CLAUDE_CONFIG" << 'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "(Write|Edit|Update|MultiEdit)",
        "hooks": [
          {
            "type": "command",
            "command": "claude-lsp-cli hook PostToolUse"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "claude-lsp-cli hook SessionStart"
          }
        ]
      }
    ]
  }
}
EOF
    echo "✅ Created settings.json with LSP hooks"
else
    echo "⚠️  Claude Code settings.json already exists."
    echo "   Please manually add the hooks configuration:"
    echo "   See: https://github.com/teamchong/claude-code-lsp#installation"
fi

# Create version info
echo "v3.0.0" > "$DATA_DIR/VERSION"
echo "$(date)" > "$DATA_DIR/INSTALLED"

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Test the installation
echo ""
echo "🧪 Testing installation..."
if [ -x "$INSTALL_DIR/claude-lsp-cli" ]; then
    echo "✅ CLI binary is executable"
else
    echo "❌ CLI binary is not executable"
    exit 1
fi

if [ -x "$INSTALL_DIR/claude-lsp-server" ]; then
    echo "✅ Server binary is executable"
else
    echo "❌ Server binary is not executable"
    exit 1
fi

# Check language servers
echo ""
echo "📋 Language Server Status:"
echo ""

check_language_server() {
    local name="$1"
    local command="$2"
    local install_cmd="$3"
    
    if command -v "$command" &> /dev/null; then
        echo "✅ $name - installed"
    else
        echo "⚠️  $name - not installed"
        if [ -n "$install_cmd" ]; then
            echo "   To install: $install_cmd"
        fi
    fi
}

# Auto-installed languages
echo "✅ TypeScript/JavaScript - auto-installs when needed"
echo "✅ PHP - auto-installs when needed"

# Manual installation required
check_language_server "Python" "pylsp" "pip install python-lsp-server"
check_language_server "Rust" "rust-analyzer" "rustup component add rust-analyzer"
check_language_server "Go" "gopls" "go install golang.org/x/tools/gopls@latest"
check_language_server "Java" "jdtls" "brew install jdtls"
check_language_server "C/C++" "clangd" "brew install llvm"
check_language_server "Ruby" "solargraph" "gem install solargraph"
check_language_server "Scala" "metals" "cs install metals"
check_language_server "Lua" "lua-language-server" "mise install lua-language-server@latest"
check_language_server "Elixir" "language_server.sh" "mise install elixir-ls@latest"
check_language_server "Terraform" "terraform-ls" "mise install terraform-ls@latest"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Installed to standard locations:"
echo "  • Binaries: $INSTALL_DIR/claude-lsp-{cli,server}"
echo "  • Data: $DATA_DIR"
echo "  • Config: $CLAUDE_CONFIG"
echo ""
echo "The system will automatically:"
echo "  1. Check your code after every edit in Claude Code"
echo "  2. Start language servers as needed"
echo "  3. Provide real-time diagnostics and error reporting"
echo ""
echo "Supported languages (12/12 working):"
echo "  TypeScript, JavaScript, Python, Rust, Go, Java, C/C++,"
echo "  Ruby, PHP, Scala, Lua, Elixir, Terraform"
echo ""
echo "To uninstall:"
echo "  rm -rf '$INSTALL_DIR/claude-lsp-*' '$DATA_DIR' && remove hooks from '$CLAUDE_CONFIG'"
echo ""
echo "To test manually:"
echo "  claude-lsp-cli diagnostics /path/to/project"
echo ""
echo "🎉 Ready! Edit code files in Claude Code to see diagnostics."