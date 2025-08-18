#!/bin/bash

# Claude Code LSP Test Setup Script
# This script sets up test projects to verify LSP functionality

set -e

echo "🧪 Claude Code LSP Test Setup"
echo "=============================="

# Create test directory
TEST_DIR="/tmp/claude-lsp-test-$$"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📁 Test directory: $TEST_DIR"

# Create TypeScript test project
echo "📘 Creating TypeScript test project..."
mkdir -p ts-project
cd ts-project

# Create package.json
cat > package.json << 'EOFINNER'
{
  "name": "test-ts-project",
  "version": "1.0.0",
  "type": "module",
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "typescript-language-server": "^4.0.0"
  }
}
EOFINNER

# Create tsconfig.json
cat > tsconfig.json << 'EOFINNER'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
EOFINNER

# Create test TypeScript file with intentional errors
cat > test.ts << 'EOFINNER'
// Test file with intentional errors
const message: string = 123; // Type error
console.log(mesage); // Typo error

function add(a: number, b: number) {
  return a + b;
}

add("1", "2"); // Type error
EOFINNER

echo "✅ TypeScript project created"

# Create Python test project
cd "$TEST_DIR"
echo "🐍 Creating Python test project..."
mkdir -p py-project
cd py-project

# Create test Python file with intentional errors
cat > test.py << 'EOFINNER'
# Test file with intentional errors
def add(a: int, b: int) -> int:
    return a + b

result = add("1", "2")  # Type error
print(reslt)  # Name error

def unused_function():
    pass  # Unused function warning
EOFINNER

echo "✅ Python project created"

# Run diagnostics test
echo ""
echo "🔍 Running diagnostics test..."
echo "================================"

# Test TypeScript project
echo "📘 Testing TypeScript diagnostics..."
cd "$TEST_DIR/ts-project"
if command -v claude-lsp-cli >/dev/null 2>&1; then
    claude-lsp-cli diagnostics . test.ts || true
else
    echo "⚠️  claude-lsp-cli not found in PATH"
fi

# Test Python project  
echo ""
echo "🐍 Testing Python diagnostics..."
cd "$TEST_DIR/py-project"
if command -v claude-lsp-cli >/dev/null 2>&1; then
    claude-lsp-cli diagnostics . test.py || true
else
    echo "⚠️  claude-lsp-cli not found in PATH"
fi

echo ""
echo "✨ Test setup complete!"
echo "Test projects created in: $TEST_DIR"
echo ""
echo "To manually test:"
echo "  cd $TEST_DIR/ts-project && claude-lsp-cli diagnostics ."
echo "  cd $TEST_DIR/py-project && claude-lsp-cli diagnostics ."
echo ""
echo "To clean up:"
echo "  rm -rf $TEST_DIR"
