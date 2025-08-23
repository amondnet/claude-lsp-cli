#!/bin/bash

# Claude Code LSP Local Binary Installer
# Installs the locally built binaries from bin/ directory

set -e

INSTALL_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/claude-lsp"
CLAUDE_CONFIG="$HOME/.claude/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Claude Code LSP Local Binary Installer"
echo "=========================================="
echo ""

# Clean up any existing LSP server processes before installation
echo "🧹 Cleaning up existing processes..."
if pgrep -f "claude-lsp-server" > /dev/null 2>&1; then
    echo "  Stopping existing LSP servers..."
    pkill -f "claude-lsp-server" 2>/dev/null || true
    # Wait for processes to terminate (max 3 seconds)
    count=0
    while pgrep -f "claude-lsp-server" > /dev/null 2>&1 && [ $count -lt 30 ]; do
        sleep 0.1
        count=$((count + 1))
    done
    if [ $count -ge 30 ]; then
        # Force kill if still running
        pkill -9 -f "claude-lsp-server" 2>/dev/null || true
        sleep 0.5  # Give it time to die
    fi
    echo "  ✓ Stopped existing LSP servers"
fi

# Also clean up any stale Unix sockets
if ls /tmp/claude-lsp-*.sock >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-*.sock
    echo "  ✓ Removed stale Unix sockets"
fi
echo ""

# Build binaries first
echo "🔨 Building binaries..."
if command -v bun &> /dev/null; then
    cd "$SCRIPT_DIR"
    bun run build
    echo "✅ Binaries built successfully"
else
    echo "❌ Error: Bun is not installed"
    echo "   Please install Bun first: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check if binaries were built successfully
if [ ! -f "$SCRIPT_DIR/bin/claude-lsp-cli" ] || [ ! -f "$SCRIPT_DIR/bin/claude-lsp-server" ]; then
    echo "❌ Build failed - binaries not found in $SCRIPT_DIR/bin/"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

# Install the locally built binaries
echo "📋 Installing local binaries..."
cp "$SCRIPT_DIR/bin/claude-lsp-cli" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/bin/claude-lsp-server" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/claude-lsp-cli"
chmod +x "$INSTALL_DIR/claude-lsp-server"

echo "✅ Installed binaries from $SCRIPT_DIR/bin/ to $INSTALL_DIR/"
echo "   CLI: $INSTALL_DIR/claude-lsp-cli"
echo "   Server: $INSTALL_DIR/claude-lsp-server"

# Add to PATH if needed
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "🔗 Adding $INSTALL_DIR to PATH..."
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc" 2>/dev/null || true
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
    echo "   Please restart your terminal or run: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# Hook Configuration Instructions
echo ""
echo "🔧 Claude Code Configuration Setup"
echo "==================================="
echo ""
echo "The binaries are installed. Now you need to configure Claude Code to use them."
echo ""
echo "Please run Claude Code with access to your configuration:"
echo ""
echo "  ${GREEN}claude --add-dir ~/.claude --add-dir ~/.local/bin${NC}"
echo ""
echo "Then ask Claude to set up BOTH the hooks AND the diagnostic handling:"
echo ""
echo "  \"Please help me set up the Claude Code LSP diagnostics system by checking"
echo "  existing configurations and updating them intelligently:"
echo ""
echo "  1. First, read my existing ~/.claude/settings.json file. Then intelligently"
echo "     merge or replace the hooks section to include these LSP hooks:"
echo '     {
       "hooks": {
         "PreToolUse": [
           {
             "type": "command",
             "command": "claude-lsp-cli hook PreToolUse"
           }
         ],
         "PostToolUse": [
           {
             "type": "command",
             "command": "claude-lsp-cli hook PostToolUse"
           }
         ]
       }
     }'
echo "     If claude-lsp-cli hooks already exist, replace them. If other hooks exist,"
echo "     preserve them and add the LSP hooks alongside them."
echo ""
echo "  2. Then, read my existing ~/.claude/CLAUDE.md file. If a 'Diagnostics &"
echo "     Self-Correction Protocol' section already exists, update it. If not,"
echo "     add it with this exact content:"
echo ""
echo "===== START OF DIAGNOSTICS PROTOCOL ====="
cat "$SCRIPT_DIR/templates/CLAUDE_DIAGNOSTICS_PROTOCOL.md"
echo ""
echo "===== END OF DIAGNOSTICS PROTOCOL ====="
echo ""
echo "  Please read existing configurations first, then intelligently update both"
echo "  files without creating duplicates or breaking existing settings.\""
echo ""
echo "This ensures both hook configuration and diagnostic handling instructions."

# Test installation
echo ""
echo "🧪 Testing installation..."
VERSION=$("$INSTALL_DIR/claude-lsp-cli" --version 2>/dev/null || echo "error")
if [ "$VERSION" != "error" ] && [ -n "$VERSION" ]; then
    echo "✅ CLI binary works (version: $VERSION)"
else
    echo "⚠️  CLI binary may have issues"
fi

# Test with a simple hook call (exit code 2 is normal for PostToolUse with diagnostics)
echo '{"sessionId": "test", "workingDirectory": "/tmp"}' | NODE_ENV=test CLAUDE_LSP_MOCK_DIAGNOSTICS=true "$INSTALL_DIR/claude-lsp-cli" hook PostToolUse &>/dev/null
hook_exit_code=$?
if [ $hook_exit_code -eq 0 ] || [ $hook_exit_code -eq 2 ]; then
    echo "✅ Hook execution works (exit code: $hook_exit_code)"
else
    echo "⚠️  Hook execution test failed (exit code: $hook_exit_code)"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "The LSP system will automatically:"
echo "  • Check your code after every edit in Claude Code"
echo "  • Start language servers as needed"
echo "  • Provide real-time diagnostics"
echo ""
echo "To test manually:"
echo "  claude-lsp-cli diagnostics /path/to/project"
echo ""
echo "To uninstall:"
echo "  Run: $SCRIPT_DIR/uninstall.sh"
echo "  Or manually:"
echo "    rm -f ~/.local/bin/claude-lsp-{cli,server,hook,diagnostics}"
echo "    Remove hooks from ~/.claude/settings.json"
echo "    Remove Diagnostics & Self-Correction Protocol from ~/.claude/CLAUDE.md"