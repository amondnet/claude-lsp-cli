#!/bin/bash

# Claude Code LSP CLI Uninstaller
# Removes claude-lsp-cli from all possible installation paths

set -e

echo "🗑️  Claude Code LSP CLI Uninstaller"
echo "=================================="
echo ""

# Define possible installation paths
USER_BIN="$HOME/.local/bin"
SYSTEM_BIN="/usr/local/bin"
DATA_DIR="$HOME/.local/share/claude-lsp"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CLAUDE_CONFIG="$CLAUDE_DIR/settings.json"

# Function to remove binary from a directory
remove_binary() {
    local dir="$1"
    local use_sudo="$2"
    
    if [ -f "$dir/claude-lsp-cli" ]; then
        echo "📋 Removing claude-lsp-cli from $dir..."
        if [ "$use_sudo" = "true" ]; then
            sudo rm -f "$dir/claude-lsp-cli"
        else
            rm -f "$dir/claude-lsp-cli"
        fi
        echo "✅ Removed from $dir"
    fi
}

# Stop any running instances
if pgrep -f "claude-lsp-cli" > /dev/null 2>&1; then
    echo "🛑 Stopping running claude-lsp-cli instances..."
    pkill -f "claude-lsp-cli" 2>/dev/null || true
    sleep 1
    echo "✅ Stopped running instances"
fi

# Remove from user directory (no sudo needed)
remove_binary "$USER_BIN" false

# Remove from system directory (requires sudo)
if [ -f "$SYSTEM_BIN/claude-lsp-cli" ]; then
    echo "📋 Removing claude-lsp-cli from $SYSTEM_BIN (requires sudo)..."
    if sudo rm -f "$SYSTEM_BIN/claude-lsp-cli" 2>/dev/null; then
        echo "✅ Removed from $SYSTEM_BIN"
    else
        echo "⚠️  Could not remove from $SYSTEM_BIN (permission denied)"
        echo "   You may need to run: sudo rm -f $SYSTEM_BIN/claude-lsp-cli"
    fi
fi

# Clean up data directory
if [ -d "$DATA_DIR" ]; then
    echo "📁 Removing data directory $DATA_DIR..."
    rm -rf "$DATA_DIR"
    echo "✅ Removed data directory"
fi

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
if ls /tmp/claude-lsp-*.sock >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-*.sock
    echo "  ✓ Removed socket files"
fi

if ls /tmp/claude-lsp-last-*.json >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-last-*.json
    echo "  ✓ Removed state files"
fi

# Remove hooks from Claude settings
if [ -f "$CLAUDE_CONFIG" ]; then
    echo "🔗 Removing hooks from Claude Code settings..."
    
    # Check if Node.js is available
    if command -v node &> /dev/null; then
        # Create backup with timestamp
        BACKUP_FILE="$CLAUDE_CONFIG.uninstall_backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CLAUDE_CONFIG" "$BACKUP_FILE"
        echo "   Created backup: $BACKUP_FILE"
        
        # Remove claude-lsp-cli hooks using Node.js for reliable JSON handling
        TEMP_FILE="$CLAUDE_CONFIG.tmp"
        
        # Use Node.js to process the JSON file
        node - "$CLAUDE_CONFIG" "$TEMP_FILE" <<'EOF' 2>/dev/null
const fs = require('fs');
const [,, configPath, tempPath] = process.argv;

try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Process PostToolUse hooks
    if (data.hooks && data.hooks.PostToolUse) {
        data.hooks.PostToolUse = data.hooks.PostToolUse.filter(item => {
            if (typeof item === 'object' && item.hooks && Array.isArray(item.hooks)) {
                // Filter out claude-lsp-cli commands
                item.hooks = item.hooks.filter(hook => {
                    if (typeof hook === 'object' && hook.command) {
                        return !hook.command.includes('claude-lsp-cli');
                    }
                    return true;
                });
                // Keep the container only if it has hooks
                return item.hooks.length > 0;
            }
            // Keep non-hook objects and strings
            return true;
        });
    }
    
    // Process UserPromptSubmit hooks
    if (data.hooks && data.hooks.UserPromptSubmit) {
        data.hooks.UserPromptSubmit = data.hooks.UserPromptSubmit.filter(item => {
            if (typeof item === 'object' && item.hooks && Array.isArray(item.hooks)) {
                // Filter out claude-lsp-cli commands
                item.hooks = item.hooks.filter(hook => {
                    if (typeof hook === 'object' && hook.command) {
                        return !hook.command.includes('claude-lsp-cli');
                    }
                    return true;
                });
                // Keep the container only if it has hooks
                return item.hooks.length > 0;
            }
            // Keep non-hook objects and strings
            return true;
        });
    }
    
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    process.exit(0);
} catch (e) {
    console.error('Error processing settings.json:', e.message);
    process.exit(1);
}
EOF
        
        # Check if Node succeeded
        if [ $? -eq 0 ] && [ -s "$TEMP_FILE" ]; then
            # Verify the JSON is valid by trying to parse it
            if node -e "JSON.parse(require('fs').readFileSync('$TEMP_FILE', 'utf8'))" 2>/dev/null; then
                mv "$TEMP_FILE" "$CLAUDE_CONFIG"
                echo "✅ Removed hooks from settings.json"
            else
                echo "❌ Error: Invalid JSON produced. Restoring from backup..."
                cp "$BACKUP_FILE" "$CLAUDE_CONFIG"
                rm -f "$TEMP_FILE"
                echo "⚠️  Please manually remove claude-lsp-cli hooks from:"
                echo "   $CLAUDE_CONFIG"
            fi
        else
            echo "❌ Error processing settings.json. Restoring from backup..."
            cp "$BACKUP_FILE" "$CLAUDE_CONFIG"
            rm -f "$TEMP_FILE"
            echo "⚠️  Please manually remove claude-lsp-cli hooks from:"
            echo "   $CLAUDE_CONFIG"
        fi
    else
        echo "⚠️  Node.js not found. Please manually remove claude-lsp-cli hooks from:"
        echo "   $CLAUDE_CONFIG"
    fi
fi

# Clean up CLAUDE.md
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
    echo "📝 Cleaning up CLAUDE.md..."
    
    # Remove the LSP section between markers
    if grep -q "<!-- BEGIN CLAUDE-LSP-CLI -->" "$CLAUDE_MD"; then
        # Create temp file without the LSP section
        awk '
            /<!-- BEGIN CLAUDE-LSP-CLI -->/ { skip = 1 }
            /<!-- END CLAUDE-LSP-CLI -->/ { skip = 0; next }
            !skip { print }
        ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp"
        
        mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
        echo "✅ Removed LSP section from CLAUDE.md"
    fi
fi

echo ""
echo "✅ Uninstallation complete!"
echo ""
echo "Note: If you had claude-lsp-cli in your PATH, you may need to restart"
echo "your terminal or run 'hash -r' to clear the command cache."