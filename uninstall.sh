#!/bin/bash

# Claude Code LSP Uninstaller
# Removes all installed components and configurations

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🗑️  Claude Code LSP Uninstaller"
echo "================================"
echo ""

# Define paths using HOME variable
INSTALL_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/claude-lsp"
CLAUDE_CONFIG="$HOME/.claude/settings.json"
CLAUDE_MD="$HOME/.claude/CLAUDE.md"

# Track what was removed
REMOVED_ITEMS=()

# Function to safely remove files
remove_file() {
    local file="$1"
    local description="$2"
    
    if [ -f "$file" ]; then
        rm -f "$file"
        echo -e "${GREEN}✓${NC} Removed $description"
        REMOVED_ITEMS+=("$description")
    else
        echo -e "${YELLOW}⚠${NC} $description not found (skipping)"
    fi
}

# Function to remove directory
remove_directory() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo -e "${GREEN}✓${NC} Removed $description"
        REMOVED_ITEMS+=("$description")
    else
        echo -e "${YELLOW}⚠${NC} $description not found (skipping)"
    fi
}

# 1. Remove binary
echo "📦 Removing binary..."
remove_file "$INSTALL_DIR/claude-lsp-cli" "CLI binary (unified diagnostics + hooks)"

# 2. Remove data directory
echo ""
echo "📁 Removing data directory..."
remove_directory "$DATA_DIR" "LSP data directory"

# 3. Clean up state files
echo ""
echo "🔄 Cleaning up state files..."
# Clean up project state files
if ls /tmp/claude-lsp-last-*.json >/dev/null 2>&1; then
    rm -f /tmp/claude-lsp-last-*.json
    echo -e "${GREEN}✓${NC} Removed project state files"
else
    echo -e "${YELLOW}⚠${NC} No state files found"
fi

# No Unix sockets or SQLite databases in file-based architecture
echo -e "${YELLOW}⚠${NC} No additional server files to clean (file-based architecture)"

# 4. Remove hooks from settings.json
echo ""
echo "🔧 Removing Claude Code hooks..."
if [ -f "$CLAUDE_CONFIG" ]; then
    # Create backup
    cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup"
    
    # Remove claude-lsp-cli hooks using jq if available
    if command -v jq &> /dev/null; then
        # Remove claude-lsp-cli from ALL hook types
        # Format: PostToolUse: [{hooks: [{type: "command", command: "..."}]}]
        jq 'if .hooks then
            .hooks |= with_entries(
                .value |= map(select(
                    if .hooks then
                        (.hooks | map(.command) | any(contains("claude-lsp-cli")) | not)
                    else
                        true
                    end
                ))
            ) |
            if .hooks == {} then del(.hooks) else . end
        else . end' "$CLAUDE_CONFIG.backup" > "$CLAUDE_CONFIG.tmp"
        
        mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
        echo -e "${GREEN}✓${NC} Removed claude-lsp-cli hooks from settings.json"
        REMOVED_ITEMS+=("Claude Code hooks")
    else
        # Fallback to manual instructions if jq not available
        echo -e "${YELLOW}⚠${NC} jq not found - please manually remove hooks from settings.json"
        echo "  Remove any hooks containing 'claude-lsp-cli' from:"
        echo "  $CLAUDE_CONFIG"
    fi
else
    echo -e "${YELLOW}⚠${NC} Claude settings.json not found"
fi

# 5. Remove CLAUDE-LSP-CLI section from CLAUDE.md
echo ""
echo "📝 Cleaning up CLAUDE.md..."
if [ -f "$CLAUDE_MD" ]; then
    # Create backup
    cp "$CLAUDE_MD" "$CLAUDE_MD.backup"
    
    # Remove CLAUDE-LSP-CLI section with any surrounding newlines
    # This replaces \n*<!-- BEGIN CLAUDE-LSP-CLI -->...<!-- END CLAUDE-LSP-CLI -->\n* with \n
    perl -0pe 's/\n*<!-- BEGIN CLAUDE-LSP-CLI -->.*?<!-- END CLAUDE-LSP-CLI -->\n*/\n/gs' "$CLAUDE_MD.backup" > "$CLAUDE_MD.tmp"
    
    # Replace the original file
    mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
    echo -e "${GREEN}✓${NC} Removed CLAUDE-LSP-CLI section from CLAUDE.md"
    REMOVED_ITEMS+=("CLAUDE.md LSP instructions")
else
    echo -e "${YELLOW}⚠${NC} CLAUDE.md not found (nothing to clean up)"
fi

# 6. Summary
echo ""
echo "================================"
if [ ${#REMOVED_ITEMS[@]} -gt 0 ]; then
    echo -e "${GREEN}✅ Uninstallation complete!${NC}"
    echo ""
    echo "Removed components:"
    for item in "${REMOVED_ITEMS[@]}"; do
        echo "  • $item"
    done
else
    echo -e "${YELLOW}⚠ No Claude Code LSP components were found to remove${NC}"
fi

echo ""
echo "To reinstall, run from the local repository:"
echo "  ./install.sh"