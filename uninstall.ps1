# Claude Code LSP Uninstaller for Windows
# Run with: powershell -ExecutionPolicy Bypass -File uninstall.ps1

$ErrorActionPreference = "Stop"

# Color codes for output
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }

# Set paths based on OS
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $INSTALL_DIR = "$env:LOCALAPPDATA\Programs\claude-lsp-cli"
    $CLAUDE_DIR = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
    $BINARY_NAME = "claude-lsp-cli.exe"
    $TEMP_DIR = $env:TEMP
} else {
    # Unix/macOS paths
    $INSTALL_DIR = "$HOME/.local/bin"
    $CLAUDE_DIR = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$HOME/.claude" }
    $BINARY_NAME = "claude-lsp-cli"
    $TEMP_DIR = "/tmp"
}

Write-Host "🗑️  Claude Code LSP Uninstaller" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Track what was removed
$removedItems = @()

# Remove binary
$binaryPath = Join-Path $INSTALL_DIR $BINARY_NAME
if (Test-Path $binaryPath) {
    Remove-Item $binaryPath -Force
    Write-Success "Removed claude-lsp-cli binary"
    $removedItems += "Claude LSP CLI binary"
} else {
    Write-Warning "Binary not found at $binaryPath"
}

# Remove from CLAUDE.md using markers
Write-Host ""
Write-Host "📝 Cleaning up CLAUDE.md..." -ForegroundColor Yellow
$CLAUDE_MD = Join-Path $CLAUDE_DIR "CLAUDE.md"

if (Test-Path $CLAUDE_MD) {
    # Check if section exists before trying to remove
    $content = Get-Content $CLAUDE_MD -Raw
    if ($content -match '<!-- BEGIN CLAUDE-LSP-CLI -->') {
        # Backup first
        Copy-Item $CLAUDE_MD "$CLAUDE_MD.backup" -Force
        
        # Read content as lines for better control
        $lines = Get-Content $CLAUDE_MD
    
        # Track if we're in the section to remove
        $inSection = $false
        $newLines = @()
        $lastLineWasBlank = $false
        $blankCount = 0
        
        foreach ($line in $lines) {
            if ($line -match '<!-- BEGIN CLAUDE-LSP-CLI -->') {
                $inSection = $true
                continue
            }
            if ($line -match '<!-- END CLAUDE-LSP-CLI -->') {
                $inSection = $false
                continue
            }
            if (-not $inSection) {
                # Track blank lines to limit consecutive blanks to 2
                if ($line -eq '') {
                    $blankCount++
                    if ($blankCount -le 2) {
                        $newLines += $line
                    }
                } else {
                    $blankCount = 0
                    $newLines += $line
                }
            }
        }
        
        # Join lines and ensure no trailing whitespace
        $content = ($newLines -join "`n").TrimEnd()
        
        # Write back with a trailing newline
        Set-Content -Path $CLAUDE_MD -Value $content
        Write-Success "Removed Claude LSP CLI section from CLAUDE.md"
        $removedItems += "CLAUDE.md entry"
    } else {
        Write-Warning "CLAUDE-LSP-CLI section not found in CLAUDE.md (skipping)"
    }
} else {
    Write-Warning "CLAUDE.md not found"
}

# Remove hooks from settings.json
Write-Host ""
Write-Host "🔧 Removing Claude Code hooks..." -ForegroundColor Yellow
$CLAUDE_CONFIG = Join-Path $CLAUDE_DIR "settings.json"

if (Test-Path $CLAUDE_CONFIG) {
    # Backup existing file
    Copy-Item $CLAUDE_CONFIG "$CLAUDE_CONFIG.backup" -Force
    
    try {
        # Read and modify JSON
        $settings = Get-Content $CLAUDE_CONFIG -Raw | ConvertFrom-Json
        
        # Remove claude-lsp-cli hooks from PostToolUse
        if ($settings.hooks -and $settings.hooks.PostToolUse) {
            $settings.hooks.PostToolUse = @($settings.hooks.PostToolUse | Where-Object {
                -not ($_.hooks | Where-Object { $_.command -like "*claude-lsp-cli*" })
            })
            
            # Clean up empty arrays
            if ($settings.hooks.PostToolUse.Count -eq 0) {
                $settings.hooks.PSObject.Properties.Remove("PostToolUse")
            }
            
            # Clean up empty hooks object
            if ($settings.hooks.PSObject.Properties.Count -eq 0) {
                $settings.PSObject.Properties.Remove("hooks")
            }
        }
        
        # Write back
        $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $CLAUDE_CONFIG
        Write-Success "Removed Claude LSP CLI hooks from settings.json"
        $removedItems += "Claude Code hooks"
    } catch {
        Write-Warning "Could not parse settings.json - please manually remove hooks"
    }
} else {
    Write-Warning "settings.json not found"
}

# Clean up state files
Write-Host ""
Write-Host "🔄 Cleaning up state files..." -ForegroundColor Yellow
$stateFiles = Get-ChildItem (Join-Path $TEMP_DIR "claude-lsp-last-*.json") -ErrorAction SilentlyContinue
if ($stateFiles) {
    $stateFiles | Remove-Item -Force
    Write-Success "Removed project state files"
    $removedItems += "State files"
} else {
    Write-Warning "No state files found"
}

# Remove from PATH if present (Windows only)
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -like "*$INSTALL_DIR*") {
        Write-Host ""
        Write-Host "📝 Removing from PATH..." -ForegroundColor Yellow
        $newPath = ($userPath -split ';' | Where-Object { $_ -ne $INSTALL_DIR }) -join ';'
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Success "Removed from PATH"
        $removedItems += "PATH entry"
    }
}

# Remove install directory if empty
if (Test-Path $INSTALL_DIR) {
    $files = Get-ChildItem $INSTALL_DIR
    if ($files.Count -eq 0) {
        Remove-Item $INSTALL_DIR -Force
        Write-Success "Removed empty installation directory"
        $removedItems += "Installation directory"
    }
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
if ($removedItems.Count -gt 0) {
    Write-Host "✅ Uninstallation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Removed:" -ForegroundColor White
    foreach ($item in $removedItems) {
        Write-Host "  • $item" -ForegroundColor Gray
    }
} else {
    Write-Warning "Nothing to remove - Claude Code LSP was not installed"
}
Write-Host ""
Write-Host "To reinstall, run: .\install.ps1" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan