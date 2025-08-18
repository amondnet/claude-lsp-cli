#!/bin/bash

echo "🔍 Testing Claude Code LSP Setup..."
echo ""

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install from https://bun.sh"
    exit 1
fi
echo "✅ Bun is installed: $(bun --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    bun install
fi
echo "✅ Dependencies installed"

# Build the project
echo "🔨 Building binaries..."
bun run build
if [ -f "bin/claude-lsp-cli" ] && [ -f "bin/claude-lsp-server" ] && [ -f "bin/claude-lsp-hook" ]; then
    echo "✅ All binaries built successfully:"
    echo "   - claude-lsp-cli (CLI tool)"
    echo "   - claude-lsp-server (LSP server)"
    echo "   - claude-lsp-hook (Dedicated hook handler)"
else
    echo "❌ Failed to build all binaries"
    exit 1
fi

# Check if utils directory exists
if [ -d "src/utils" ]; then
    echo "✅ Security utilities are present"
else
    echo "❌ Security utilities missing"
    exit 1
fi

# Test the CLI help
echo ""
echo "📋 Testing CLI..."
./bin/claude-lsp-cli help > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ CLI is working"
else
    echo "❌ CLI test failed"
    exit 1
fi

# Check hook file
if [ -f "hooks/lsp-diagnostics.ts" ]; then
    echo "✅ Hook file exists"
else
    echo "❌ Hook file missing"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Claude Code LSP is ready to use."
echo ""
echo "📝 Next steps:"
echo "1. Copy the hook to Claude's directory:"
echo "   cp hooks/lsp-diagnostics.ts ~/.claude/hooks/"
echo "   chmod +x ~/.claude/hooks/lsp-diagnostics.ts"
echo ""
echo "2. Update ~/.claude/settings.json:"
echo '   {
     "hooks": {
       "PostToolUse": ["~/.claude/hooks/lsp-diagnostics.ts"]
     }
   }'
echo ""
echo "3. Start using Claude Code - diagnostics will run automatically!"