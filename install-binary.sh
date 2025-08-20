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

# Configure Claude Code hooks
echo "🔧 Configuring Claude Code hooks..."
mkdir -p "$(dirname "$CLAUDE_CONFIG")"

# Python script to update settings.json
python3 << 'PYTHON_EOF'
import json
import os

config_path = os.path.expanduser("~/.claude/settings.json")

# Load existing config or create new
if os.path.exists(config_path):
    with open(config_path, 'r') as f:
        config = json.load(f)
else:
    config = {
        "$schema": "https://json.schemastore.org/claude-code-settings.json",
        "hooks": {}
    }

# Ensure hooks section exists
if "hooks" not in config:
    config["hooks"] = {}

# LSP hooks configuration
lsp_hooks = {
    "PostToolUse": [{
        "matcher": "(Write|Edit|Update|MultiEdit|NotebookEdit)",
        "hooks": [{
            "type": "command",
            "command": "claude-lsp-cli hook PostToolUse"
        }]
    }],
    "SessionStart": [{
        "hooks": [{
            "type": "command", 
            "command": "claude-lsp-cli hook SessionStart"
        }]
    }],
    "Stop": [{
        "hooks": [{
            "type": "command",
            "command": "claude-lsp-cli hook Stop"
        }]
    }]
}

# Add hooks if they don't exist
for event, hook_config in lsp_hooks.items():
    if event not in config["hooks"]:
        config["hooks"][event] = []
    
    # Check if hook already exists
    command = hook_config[0]["hooks"][0]["command"]
    exists = False
    for existing in config["hooks"][event]:
        if "hooks" in existing:
            for h in existing["hooks"]:
                if h.get("command") == command:
                    exists = True
                    break
    
    if not exists:
        config["hooks"][event].extend(hook_config)
        print(f"✅ Added {event} hook")
    else:
        print(f"✅ {event} hook already configured")

# Write config
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ Claude Code hooks configured")
PYTHON_EOF

# Test installation
echo ""
echo "🧪 Testing installation..."
if "$INSTALL_DIR/claude-lsp-cli" --version &>/dev/null; then
    echo "✅ CLI binary works"
else
    echo "⚠️  CLI binary may have issues (--version not implemented)"
fi

# Test with a simple hook call
if echo '{"sessionId": "test", "workingDirectory": "/tmp"}' | "$INSTALL_DIR/claude-lsp-cli" hook PostToolUse &>/dev/null; then
    echo "✅ Hook execution works"
else
    echo "⚠️  Hook execution test failed"
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
echo "  rm -f $INSTALL_DIR/claude-lsp-{cli,server}"
echo "  Remove hooks from $CLAUDE_CONFIG"