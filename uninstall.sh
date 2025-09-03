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

# 4. Hook removal instructions
echo ""
echo "🔧 Claude Code Hook Removal"
echo ""
if [ -f "$CLAUDE_CONFIG" ]; then
    echo -e "${YELLOW}⚠${NC} IMPORTANT: You need to remove the LSP hooks from Claude Code"
    echo ""
    echo "  Please use Claude Code to remove the hooks:"
    echo ""
    echo -e "  ${GREEN}claude --add-dir ~/.claude${NC}"
    echo ""
    echo "  Then ask: \"Please remove the Claude Code LSP diagnostics system:"
    echo ""
    echo "  1. Remove all claude-lsp-cli hooks from ~/.claude/settings.json"
    echo "     (PostToolUse, and any others)"
    echo ""
    echo "  2. Remove the 'Diagnostics & Self-Correction Protocol' section"
    echo "     from ~/.claude/CLAUDE.md that handles [[system-message]] reports\""
    echo ""
    echo "  This ensures complete removal without breaking other configurations."
else
    echo -e "${YELLOW}⚠${NC} Claude settings.json not found"
fi

# 5. Remind user about CLAUDE.md cleanup
echo ""
echo "📝 CLAUDE.md cleanup reminder..."
if [ -f "$CLAUDE_MD" ]; then
    echo -e "${YELLOW}⚠${NC} IMPORTANT: Your ~/.claude/CLAUDE.md may contain LSP diagnostics configuration"
    echo ""
    echo "  To safely remove the diagnostics section, please use Claude Code:"
    echo ""
    echo -e "  ${GREEN}claude --add-dir ~/.claude${NC}"
    echo -e "  Then ask: \"Please remove the 'Diagnostics & Self-Correction Protocol' section"
    echo -e "            and any [[system-message]] references from my CLAUDE.md file\""
    echo ""
    echo "  This ensures Claude can safely identify and remove only the LSP-related content"
    echo "  without accidentally deleting other important configurations."
else
    echo -e "${YELLOW}⚠${NC} CLAUDE.md not found (nothing to clean up)"
fi

# 7. Summary
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