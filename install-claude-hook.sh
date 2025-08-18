#!/bin/bash

# Claude Code LSP Hook Installer
# This script installs the LSP diagnostics hook for Claude Code

set -e

echo "🚀 Claude Code LSP Hook Installer"
echo "================================="
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check if Claude directory exists
CLAUDE_DIR="$HOME/.claude"
if [ ! -d "$CLAUDE_DIR" ]; then
    echo "❌ Claude directory not found at $CLAUDE_DIR"
    echo "   Please make sure Claude Code is installed"
    exit 1
fi

# Create hooks directory if it doesn't exist
HOOKS_DIR="$CLAUDE_DIR/hooks"
mkdir -p "$HOOKS_DIR"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "📁 Installing LSP server to Claude directory..."

# Clone or update the LSP server
LSP_DIR="$CLAUDE_DIR/claude-code-lsp"
if [ -d "$LSP_DIR" ]; then
    echo "   Updating existing installation..."
    cd "$LSP_DIR"
    git pull
else
    echo "   Cloning claude-code-lsp..."
    cd "$CLAUDE_DIR"
    git clone https://github.com/teamchong/claude-code-lsp.git
    cd "$LSP_DIR"
fi

# Install dependencies and build binaries
echo "📦 Installing dependencies and building binaries..."
bun install
bun run build

# Check if binaries were created
if [ ! -f "$LSP_DIR/bin/claude-lsp-cli" ] || [ ! -f "$LSP_DIR/bin/claude-lsp-server" ]; then
    echo "❌ Failed to build binaries"
    exit 1
fi

echo "✅ Binaries built successfully"
echo "   CLI: $LSP_DIR/bin/claude-lsp-cli"
echo "   Server: $LSP_DIR/bin/claude-lsp-server"

# Update settings.json for binary-based hooks
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "📝 Creating settings.json..."
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {
    "PostToolUse": ["claude-lsp-cli hook PostToolUse"]
  }
}
EOF
else
    echo "⚠️  settings.json exists. Please manually add the LSP hook to your configuration:"
    echo ""
    echo '  "hooks": {'
    echo '    "PostToolUse": ["claude-lsp-cli hook PostToolUse"]'
    echo '  }'
    echo ""
    echo "  Add it to your existing PostToolUse array if you have other hooks."
    echo "  Make sure the claude-lsp-cli binary is in your PATH."
fi

# Add binary to PATH by creating symlink
echo "🔗 Adding claude-lsp-cli to PATH..."
BIN_LINK="/usr/local/bin/claude-lsp-cli"
if [ -L "$BIN_LINK" ]; then
    echo "   Removing existing symlink..."
    sudo rm "$BIN_LINK"
fi

sudo ln -s "$LSP_DIR/bin/claude-lsp-cli" "$BIN_LINK"
if [ $? -eq 0 ]; then
    echo "✅ claude-lsp-cli added to PATH"
else
    echo "⚠️  Could not add to PATH. You may need to manually add $LSP_DIR/bin to your PATH"
    echo "   Or run: export PATH=\"$LSP_DIR/bin:\$PATH\""
fi

# Install commonly needed language servers
echo ""
echo "📋 Checking language servers..."
echo ""

# TypeScript (auto-installed via bun)
echo "✅ TypeScript - will auto-install when needed"

# Python
if command -v pyright &> /dev/null; then
    echo "✅ Python (Pyright) - installed"
else
    echo "⚠️  Python (Pyright) - not installed"
    echo "   To install: bun add -g pyright"
fi

# Rust
if command -v rust-analyzer &> /dev/null; then
    echo "✅ Rust - installed"
else
    echo "⚠️  Rust - not installed"
    echo "   To install: curl -L https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-aarch64-apple-darwin.gz | gunzip -c - > /usr/local/bin/rust-analyzer && chmod +x /usr/local/bin/rust-analyzer"
fi

# Go
if command -v gopls &> /dev/null; then
    echo "✅ Go - installed"
else
    echo "⚠️  Go - not installed"
    echo "   To install: go install golang.org/x/tools/gopls@latest"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "The LSP diagnostics system is now set up:"
echo "  • LSP server: $LSP_DIR/bin/claude-lsp-server"
echo "  • CLI tool: claude-lsp-cli (available in PATH)"
echo "  • Hook configured in Claude Code settings"
echo ""
echo "The system will automatically:"
echo "  1. Start LSP server when needed"
echo "  2. Check code after file edits in Claude Code"
echo "  3. Provide structured diagnostic feedback"
echo ""
echo "Supported languages: TypeScript, JavaScript, Python, Rust, Go, Java, C/C++,"
echo "Ruby, PHP, HTML, CSS, JSON, YAML, Vue, Svelte, and more!"
echo ""
echo "To test manually:"
echo "  claude-lsp-cli diagnostics /path/to/project"
echo ""
echo "To test with Claude Code, edit a TypeScript or Python file."