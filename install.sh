#!/bin/bash

# Claude Code File-Based Diagnostics Installer  
# Installs the file-based type checking binaries

set -e

INSTALL_DIR="/usr/local/bin"
DATA_DIR="$HOME/.local/share/claude-lsp"
# Use environment variable if set, otherwise default to ~/.claude
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CLAUDE_CONFIG="$CLAUDE_DIR/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Claude Code LSP Local Binary Installer"
echo "=========================================="
echo ""

# Clean up any old files
echo "🧹 Cleaning up old files..."
if ls /tmp/claude-lsp-*.sock >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-*.sock
    echo "  ✓ Removed old socket files"
fi

# Clean up old project state files
if ls /tmp/claude-lsp-last-*.json >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-last-*.json
    echo "  ✓ Removed old state files"
fi
echo ""

# Build binaries first
echo "🔨 Building binaries..."
if command -v bun &> /dev/null; then
    cd "$SCRIPT_DIR"
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        bun install
        echo "✅ Dependencies installed"
    fi
    
    # Build the binaries
    bun run build
    echo "✅ Binaries built successfully"
else
    echo "❌ Error: Bun is not installed"
    echo ""
    echo "Please install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    echo "After installation, restart your terminal and run this script again."
    exit 1
fi

# Check if binary was built successfully
if [ ! -f "$SCRIPT_DIR/bin/claude-lsp-cli" ]; then
    echo "❌ Build failed - binary not found in $SCRIPT_DIR/bin/"
    echo "Expected: claude-lsp-cli"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

# Install the locally built binary
echo "📋 Installing local binary..."

# Kill any running instances of the binary before copying
if pgrep -f "claude-lsp-cli" > /dev/null 2>&1; then
    echo "  Stopping running claude-lsp-cli instances..."
    pkill -f "claude-lsp-cli" 2>/dev/null || true
    sleep 0.5  # Give it time to terminate
fi

# Create install directory if needed
sudo mkdir -p "$INSTALL_DIR"

# Use install command which handles busy files better, or force copy
if command -v install &> /dev/null; then
    sudo install -m 755 "$SCRIPT_DIR/bin/claude-lsp-cli" "$INSTALL_DIR/"
else
    # Fallback: remove existing file first if it exists
    [ -f "$INSTALL_DIR/claude-lsp-cli" ] && sudo rm -f "$INSTALL_DIR/claude-lsp-cli"
    
    sudo cp "$SCRIPT_DIR/bin/claude-lsp-cli" "$INSTALL_DIR/"
    sudo chmod +x "$INSTALL_DIR/claude-lsp-cli"
fi

echo "✅ Installed binary from $SCRIPT_DIR/bin/ to $INSTALL_DIR/"
echo "   CLI: $INSTALL_DIR/claude-lsp-cli"

# Verify installation is accessible
if command -v claude-lsp-cli &> /dev/null; then
    echo "✅ claude-lsp-cli is now available in PATH"
else
    echo "⚠️  claude-lsp-cli not found in PATH - you may need to restart your terminal"
fi

# Test installation
echo ""
echo "🧪 Testing installation..."
VERSION=$("$INSTALL_DIR/claude-lsp-cli" --version 2>/dev/null || echo "error")
if [ "$VERSION" != "error" ] && [ -n "$VERSION" ]; then
    echo "✅ CLI binary works (version: $VERSION)"
else
    echo "⚠️  CLI binary may have issues"
fi


# Update CLAUDE.md with LSP instructions
echo ""
echo "📝 Updating CLAUDE.md with LSP instructions..."
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
    # Existing file - update it
    cp "$CLAUDE_MD" "$CLAUDE_MD.backup"
    
    # Check if section exists and remove it if found
    if grep -q "<!-- BEGIN CLAUDE-LSP-CLI -->" "$CLAUDE_MD.backup"; then
        # Remove existing CLAUDE-LSP-CLI section including surrounding newlines
        perl -0pe 's/\n*<!-- BEGIN CLAUDE-LSP-CLI -->.*?<!-- END CLAUDE-LSP-CLI -->\n*//gs' "$CLAUDE_MD.backup" > "$CLAUDE_MD.tmp"
    else
        # No section to remove, just copy the file
        cp "$CLAUDE_MD.backup" "$CLAUDE_MD.tmp"
    fi
    
    # Trim all trailing newlines from the file
    perl -pi -e 'chomp if eof' "$CLAUDE_MD.tmp"
    
    # Check if file is empty or has content
    if [ ! -s "$CLAUDE_MD.tmp" ]; then
        # File is empty, no need for leading newlines
        true  # No-op
    else
        # File has content, add appropriate spacing
        # Check how many trailing newlines the content already has by looking at last chars
        last_chars=$(tail -c 3 "$CLAUDE_MD.tmp" 2>/dev/null | od -An -tx1)
        
        # Add newlines as needed (we want 2 blank lines before section)
        echo "" >> "$CLAUDE_MD.tmp"
        echo "" >> "$CLAUDE_MD.tmp"
    fi
    echo "<!-- BEGIN CLAUDE-LSP-CLI -->" >> "$CLAUDE_MD.tmp"
    
    # Copy content from CLAUDE_INSTRUCTIONS.md if it exists
    if [ -f "$SCRIPT_DIR/CLAUDE_INSTRUCTIONS.md" ]; then
        cat "$SCRIPT_DIR/CLAUDE_INSTRUCTIONS.md" >> "$CLAUDE_MD.tmp"
    else
        # Fallback minimal content if file not found
        echo "# LSP Diagnostic Protocol" >> "$CLAUDE_MD.tmp"
        echo "" >> "$CLAUDE_MD.tmp"
        echo "File-based diagnostics tool. Run 'claude-lsp-cli' for documentation." >> "$CLAUDE_MD.tmp"
    fi
    
    echo "<!-- END CLAUDE-LSP-CLI -->" >> "$CLAUDE_MD.tmp"
    
    # Replace the original file
    mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
    rm -f "$CLAUDE_MD.backup"
    echo "✅ Updated CLAUDE.md with LSP instructions"
else
    # New file - create with section from CLAUDE_INSTRUCTIONS.md
    mkdir -p "$CLAUDE_DIR"
    
    echo "<!-- BEGIN CLAUDE-LSP-CLI -->" > "$CLAUDE_MD"
    
    # Copy content from CLAUDE_INSTRUCTIONS.md if it exists
    if [ -f "$SCRIPT_DIR/CLAUDE_INSTRUCTIONS.md" ]; then
        cat "$SCRIPT_DIR/CLAUDE_INSTRUCTIONS.md" >> "$CLAUDE_MD"
    else
        # Fallback minimal content if file not found
        echo "# LSP Diagnostic Protocol" >> "$CLAUDE_MD"
        echo "" >> "$CLAUDE_MD"
        echo "File-based diagnostics tool. Run 'claude-lsp-cli' for documentation." >> "$CLAUDE_MD"
    fi
    
    echo "<!-- END CLAUDE-LSP-CLI -->" >> "$CLAUDE_MD"
    
    echo "✅ Created CLAUDE.md with LSP instructions"
fi

# Install hooks to settings.json
echo ""
echo "🔧 Installing Claude Code hooks..."
# CLAUDE_CONFIG already set above

if [ -f "$CLAUDE_CONFIG" ]; then
    # Create backup
    cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup"
    
    if command -v jq &> /dev/null; then
        # Remove any existing claude-lsp-cli hooks first, then add fresh ones
        # The correct format is: PostToolUse: [{hooks: [{type: "command", command: "..."}]}]
        jq '.hooks.PostToolUse = ((.hooks.PostToolUse // []) | 
            map(select(.hooks | map(.command) | any(contains("claude-lsp-cli")) | not))) + [{
            "hooks": [{
                "type": "command",
                "command": "claude-lsp-cli hook PostToolUse"
            }]
        }]' "$CLAUDE_CONFIG.backup" > "$CLAUDE_CONFIG"
        
        rm -f "$CLAUDE_CONFIG.tmp"
        rm -f "$CLAUDE_CONFIG.backup"
        echo "✅ Installed hooks to settings.json"
    else
        echo "⚠️  jq not found - please manually add hooks to settings.json:"
        echo '  "hooks": {'
        echo '    "PostToolUse": [{"hooks": [{"type": "command", "command": "claude-lsp-cli hook PostToolUse"}]}]'
        echo '  }'
    fi
else
    # Create new settings.json with hooks
    mkdir -p "$CLAUDE_DIR"
    cat > "$CLAUDE_CONFIG" << 'EOF'
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "claude-lsp-cli hook PostToolUse"
          }
        ]
      }
    ]
  }
}
EOF
    echo "✅ Created settings.json with hooks"
fi

# Check if PATH contains install directory
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "⚠️  Add $INSTALL_DIR to your PATH:"
    echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc"
    echo "    source ~/.zshrc"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "The file-based diagnostics system will automatically:"
echo "  • Check your code after every edit in Claude Code"
echo "  • Use direct tool invocation (no language servers needed)"
echo "  • Provide fast diagnostics with 11 language support"
echo ""
echo "Run 'claude-lsp-cli' to see all available commands"