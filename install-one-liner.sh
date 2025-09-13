#!/bin/bash
# One-liner installation script for claude-lsp-cli
# Usage: curl -fsSL https://raw.githubusercontent.com/teamchong/claude-lsp-cli/main/install-one-liner.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Installing claude-lsp-cli...${NC}"

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

# Set installation directory based on common practices
if [ "$OS" = "Darwin" ]; then
    # macOS
    if [ "$ARCH" = "arm64" ]; then
        # Apple Silicon - use Homebrew's directory if it exists
        if [ -d "/opt/homebrew/bin" ]; then
            INSTALL_DIR="/opt/homebrew/bin"
            NEEDS_SUDO=false
        else
            INSTALL_DIR="/usr/local/bin"
            NEEDS_SUDO=true
        fi
    else
        # Intel Mac
        INSTALL_DIR="/usr/local/bin"
        NEEDS_SUDO=true
    fi
elif [ "$OS" = "Linux" ]; then
    # Linux - prefer user installation
    if [ -d "$HOME/.local/bin" ] && [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
        INSTALL_DIR="$HOME/.local/bin"
        NEEDS_SUDO=false
    else
        INSTALL_DIR="/usr/local/bin"
        NEEDS_SUDO=true
    fi
else
    echo -e "${RED}Unsupported OS: $OS${NC}"
    exit 1
fi

# Download latest release
TEMP_DIR="$(mktemp -d)"
cd "$TEMP_DIR"

echo "Downloading latest release..."
curl -fsSL https://github.com/teamchong/claude-lsp-cli/releases/latest/download/claude-lsp-cli-$OS-$ARCH.tar.gz | tar xz

# Install binary
if [ "$NEEDS_SUDO" = true ]; then
    echo -e "${YELLOW}Installing to $INSTALL_DIR (requires sudo)${NC}"
    sudo mv claude-lsp-cli "$INSTALL_DIR/"
    sudo chmod +x "$INSTALL_DIR/claude-lsp-cli"
else
    echo -e "${GREEN}Installing to $INSTALL_DIR${NC}"
    mv claude-lsp-cli "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/claude-lsp-cli"
fi

# Cleanup
cd /
rm -rf "$TEMP_DIR"

# Verify installation
if command -v claude-lsp-cli &> /dev/null; then
    echo -e "${GREEN}✅ claude-lsp-cli installed successfully!${NC}"
    claude-lsp-cli --version
else
    echo -e "${YELLOW}⚠️  Installation complete but claude-lsp-cli not found in PATH${NC}"
    echo "Add $INSTALL_DIR to your PATH:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi

# Configure Claude Code hooks
echo -e "${GREEN}Configuring Claude Code hooks...${NC}"
claude-lsp-cli install-hooks

echo -e "${GREEN}Installation complete!${NC}"