# Claude Code LSP Installer for Windows
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Claude Code LSP Installer for Windows" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check for Bun
try {
    $bunVersion = bun --version 2>$null
    Write-Host "✅ Bun found: $bunVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Bun is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Bun from https://bun.sh" -ForegroundColor Yellow
    Write-Host "Run in PowerShell as Administrator:" -ForegroundColor Yellow
    Write-Host "  powershell -c `"irm bun.sh/install.ps1|iex`"" -ForegroundColor Cyan
    exit 1
}

# Set installation paths based on OS
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $INSTALL_DIR = "$env:LOCALAPPDATA\Programs\claude-lsp-cli"
    $CLAUDE_DIR = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
    $BINARY_NAME = "claude-lsp-cli.exe"
} else {
    # Unix/macOS paths
    $INSTALL_DIR = "$HOME/.local/bin"
    $CLAUDE_DIR = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$HOME/.claude" }
    $BINARY_NAME = "claude-lsp-cli"
}

# Create directories
Write-Host "📁 Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $CLAUDE_DIR | Out-Null

# Get script directory
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    & bun install
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
}

# Build the binary
Write-Host "🔨 Building claude-lsp-cli..." -ForegroundColor Yellow
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    & bun run build:windows
    $binaryPath = Join-Path $SCRIPT_DIR "bin" "claude-lsp-cli.exe"
} else {
    & bun run build
    $binaryPath = Join-Path $SCRIPT_DIR "bin" "claude-lsp-cli"
}
if (-not (Test-Path $binaryPath)) {
    Write-Host "❌ Build failed - binary not found" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build complete" -ForegroundColor Green

# Install binary
Write-Host "📦 Installing to $INSTALL_DIR..." -ForegroundColor Yellow
Copy-Item $binaryPath -Destination $INSTALL_DIR -Force
Write-Host "✅ Binary installed" -ForegroundColor Green

# Update CLAUDE.md
Write-Host ""
Write-Host "📝 Updating CLAUDE.md with LSP instructions..." -ForegroundColor Yellow
$CLAUDE_MD = Join-Path $CLAUDE_DIR "CLAUDE.md"

if (Test-Path $CLAUDE_MD) {
    # Backup existing file
    Copy-Item $CLAUDE_MD "$CLAUDE_MD.backup" -Force
    
    # Read content
    $content = Get-Content $CLAUDE_MD -Raw
    
    # Check if section exists and remove it if found
    if ($content -match '<!-- BEGIN CLAUDE-LSP-CLI -->') {
        $content = $content -replace '(?s)\n*<!-- BEGIN CLAUDE-LSP-CLI -->.*?<!-- END CLAUDE-LSP-CLI -->\n*', ''
    }
    
    # Trim trailing newlines
    $content = $content.TrimEnd()
    
    # Check if content is empty and add appropriate spacing
    if ([string]::IsNullOrWhiteSpace($content)) {
        # File is empty or only whitespace, no need for leading newlines
        $content = "<!-- BEGIN CLAUDE-LSP-CLI -->`n"
    } else {
        # File has content, add 2 newlines for spacing
        $content += "`n`n<!-- BEGIN CLAUDE-LSP-CLI -->`n"
    }
    
    $instructionsPath = Join-Path $SCRIPT_DIR "CLAUDE_INSTRUCTIONS.md"
    if (Test-Path $instructionsPath) {
        $instructions = Get-Content $instructionsPath -Raw
        $content += $instructions
    } else {
        # Fallback minimal content if file not found
        $content += "# LSP Diagnostic Protocol`n`nFile-based diagnostics tool. Run 'claude-lsp-cli' for documentation."
    }
    
    $content += "`n<!-- END CLAUDE-LSP-CLI -->"
    
    # Write back with a trailing newline
    Set-Content -Path $CLAUDE_MD -Value $content
    Write-Host "✅ Updated CLAUDE.md" -ForegroundColor Green
} else {
    # Create new file from CLAUDE_INSTRUCTIONS.md
    $content = "<!-- BEGIN CLAUDE-LSP-CLI -->`n"
    
    $instructionsPath = Join-Path $SCRIPT_DIR "CLAUDE_INSTRUCTIONS.md"
    if (Test-Path $instructionsPath) {
        $instructions = Get-Content $instructionsPath -Raw
        $content += $instructions
    } else {
        # Fallback minimal content if file not found
        $content += "# LSP Diagnostic Protocol`n`nFile-based diagnostics tool. Run 'claude-lsp-cli' for documentation."
    }
    
    $content += "`n<!-- END CLAUDE-LSP-CLI -->"
    
    # Write back with a trailing newline
    Set-Content -Path $CLAUDE_MD -Value $content
    Write-Host "✅ Created CLAUDE.md" -ForegroundColor Green
}

# Install hooks to settings.json
Write-Host ""
Write-Host "🔧 Installing Claude Code hooks..." -ForegroundColor Yellow
$CLAUDE_CONFIG = Join-Path $CLAUDE_DIR "settings.json"

if (Test-Path $CLAUDE_CONFIG) {
    # Backup existing file
    Copy-Item $CLAUDE_CONFIG "$CLAUDE_CONFIG.backup" -Force
    
    # Read and modify JSON
    $settings = Get-Content $CLAUDE_CONFIG -Raw | ConvertFrom-Json
    
    # Initialize hooks if not exists
    if (-not $settings.hooks) {
        $settings | Add-Member -MemberType NoteProperty -Name "hooks" -Value @{} -Force
    }
    
    # Initialize PostToolUse if not exists
    if (-not $settings.hooks.PostToolUse) {
        $settings.hooks | Add-Member -MemberType NoteProperty -Name "PostToolUse" -Value @() -Force
    }
    
    # Remove existing claude-lsp-cli hooks
    $settings.hooks.PostToolUse = @($settings.hooks.PostToolUse | Where-Object {
        -not ($_.hooks | Where-Object { $_.command -like "*claude-lsp-cli*" })
    })
    
    # Add new hook with correct command based on OS
    $hookCommand = if ($IsWindows -or $env:OS -eq "Windows_NT") {
        "claude-lsp-cli.exe hook PostToolUse"
    } else {
        "claude-lsp-cli hook PostToolUse"
    }
    
    $newHook = @{
        hooks = @(
            @{
                type = "command"
                command = $hookCommand
            }
        )
    }
    $settings.hooks.PostToolUse += $newHook
    
    # Write back
    $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $CLAUDE_CONFIG
    Write-Host "✅ Updated settings.json with hooks" -ForegroundColor Green
} else {
    # Create new settings.json with correct command based on OS
    $hookCommand = if ($IsWindows -or $env:OS -eq "Windows_NT") {
        "claude-lsp-cli.exe hook PostToolUse"
    } else {
        "claude-lsp-cli hook PostToolUse"
    }
    
    $settings = @{
        hooks = @{
            PostToolUse = @(
                @{
                    hooks = @(
                        @{
                            type = "command"
                            command = $hookCommand
                        }
                    )
                }
            )
        }
    }
    
    $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $CLAUDE_CONFIG
    Write-Host "✅ Created settings.json with hooks" -ForegroundColor Green
}

# Add to PATH if needed
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$INSTALL_DIR*") {
    Write-Host ""
    Write-Host "⚠️  Adding $INSTALL_DIR to PATH..." -ForegroundColor Yellow
    $newPath = "$userPath;$INSTALL_DIR"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = "$env:Path;$INSTALL_DIR"
    Write-Host "✅ Added to PATH (restart terminal to apply)" -ForegroundColor Green
} else {
    Write-Host "✅ Already in PATH" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "The file-based diagnostics system will automatically:" -ForegroundColor Cyan
Write-Host "  • Check your code after every edit in Claude Code" -ForegroundColor Gray
Write-Host "  • Use direct tool invocation (no language servers needed)" -ForegroundColor Gray
Write-Host "  • Provide fast diagnostics with 11 language support" -ForegroundColor Gray
Write-Host ""
Write-Host "Run 'claude-lsp-cli' to see all available commands" -ForegroundColor Cyan
Write-Host "Note: You may need to restart your terminal for PATH changes to take effect" -ForegroundColor Yellow