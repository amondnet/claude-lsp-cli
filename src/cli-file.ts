#!/usr/bin/env bun
/**
 * File-Based CLI - Simple command-line interface for file checking
 */

import { checkFile, formatDiagnostics } from "./file-checker";
import { spawn } from "bun";

const LANGUAGE_SUPPORT = {
  "TypeScript": {
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    checker: "tsc",
    install: "npm install -g typescript"
  },
  "JavaScript": {
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    checker: "eslint",
    install: "npm install -g eslint"
  },
  "Python": {
    extensions: [".py", ".pyi"],
    checker: "pyright or mypy",
    install: "pip install pyright OR pip install mypy"
  },
  "Go": {
    extensions: [".go"],
    checker: "go vet",
    install: "Install Go from https://go.dev"
  },
  "Rust": {
    extensions: [".rs"],
    checker: "rustc",
    install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  },
  "Java": {
    extensions: [".java"],
    checker: "javac",
    install: "Install JDK from https://adoptium.net"
  },
  "C": {
    extensions: [".c", ".h"],
    checker: "gcc",
    install: "Install GCC or Clang (usually pre-installed)"
  },
  "C++": {
    extensions: [".cpp", ".cc", ".cxx", ".hpp"],
    checker: "g++",
    install: "Install GCC or Clang (usually pre-installed)"
  },
  "Ruby": {
    extensions: [".rb"],
    checker: "ruby -c",
    install: "Install Ruby from https://www.ruby-lang.org"
  },
  "PHP": {
    extensions: [".php"],
    checker: "php -l",
    install: "Install PHP from https://www.php.net"
  },
  "Swift": {
    extensions: [".swift"],
    checker: "swiftc",
    install: "Install Xcode (macOS) or Swift from https://swift.org"
  },
  "Kotlin": {
    extensions: [".kt", ".kts"],
    checker: "kotlinc",
    install: "Install Kotlin from https://kotlinlang.org"
  }
};

async function checkToolInstalled(command: string): Promise<boolean> {
  try {
    const [cmd, ...args] = command.split(" ");
    const proc = spawn(["which", cmd], { stdio: ["ignore", "pipe", "ignore"] });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function showHelp() {
  console.log(`
Claude LSP File Checker - Simple file-based type checking

Usage:
  claude-lsp-file check <file>     Check a single file for errors
  claude-lsp-file hook PostToolUse  Run as Claude Code hook
  claude-lsp-file languages         Show language support status
  claude-lsp-file help             Show this help message

Examples:
  claude-lsp-file check src/app.ts
  claude-lsp-file check main.py
  echo '{"tool_name":"Edit",...}' | claude-lsp-file hook PostToolUse

Supported Languages:
`);
  
  // Check which tools are installed
  for (const [lang, info] of Object.entries(LANGUAGE_SUPPORT)) {
    const checkers = info.checker.split(" or ");
    let installed = false;
    
    for (const checker of checkers) {
      if (await checkToolInstalled(checker)) {
        installed = true;
        break;
      }
    }
    
    const status = installed ? "✅" : "❌";
    const exts = info.extensions.join(", ");
    console.log(`  ${status} ${lang.padEnd(12)} ${exts.padEnd(20)} ${info.checker}`);
    
    if (!installed) {
      console.log(`     → Install: ${info.install}`);
    }
  }
  
  console.log(`
Hook Integration:
  Add to ~/.claude/settings.json:
  {
    "hooks": {
      "PostToolUse": [{
        "type": "command",
        "command": "claude-lsp-file hook PostToolUse"
      }]
    }
  }
`);
}

async function showLanguages() {
  console.log("Language Support Status:\n");
  console.log("Language     Extensions           Checker              Status");
  console.log("─".repeat(70));
  
  for (const [lang, info] of Object.entries(LANGUAGE_SUPPORT)) {
    const checkers = info.checker.split(" or ");
    let installed = false;
    let installedChecker = "";
    
    for (const checker of checkers) {
      if (await checkToolInstalled(checker)) {
        installed = true;
        installedChecker = checker;
        break;
      }
    }
    
    const status = installed ? `✅ ${installedChecker}` : "❌ Not installed";
    const exts = info.extensions.join(", ");
    
    console.log(
      lang.padEnd(12) +
      exts.padEnd(20) +
      info.checker.padEnd(20) +
      status
    );
    
    if (!installed) {
      console.log(`${"".padEnd(12)}Install: ${info.install}`);
      console.log();
    }
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  
  switch (command) {
    case "check": {
      const file = args[0];
      if (!file) {
        console.error("Error: Please provide a file to check");
        console.error("Usage: claude-lsp-file check <file>");
        process.exit(1);
      }
      
      const result = await checkFile(file);
      if (result) {
        const formatted = formatDiagnostics(result);
        if (formatted) {
          console.log(formatted);
          process.exit(1);
        } else {
          console.log(`✅ No issues found in ${file}`);
        }
      } else {
        console.error(`Cannot check ${file} (unsupported type or file not found)`);
        process.exit(1);
      }
      break;
    }
    
    case "hook": {
      const eventType = args[0];
      if (eventType === "PostToolUse") {
        // Hook mode is handled by hook-file.ts
        const { handlePostToolUse } = await import("./hook-file");
        await handlePostToolUse();
      }
      break;
    }
    
    case "languages":
    case "status":
      await showLanguages();
      break;
    
    case "help":
    case "--help":
    case "-h":
    case undefined:
      await showHelp();
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'claude-lsp-file help' for usage information");
      process.exit(1);
  }
}

// Export for use in hook-file.ts
export async function handlePostToolUse() {
  const { handlePostToolUse: hookHandler } = await import("./hook-file");
  await hookHandler();
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });
}