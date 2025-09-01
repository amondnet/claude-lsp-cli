import { spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

// Helper to get all available elixir-ls version paths
function getElixirLSVersionPaths(name: string): string[] {
  const elixirLSDir = join(process.env.HOME || "", ".local", "share", "mise", "installs", "elixir-ls");
  
  if (!existsSync(elixirLSDir)) {
    return [];
  }
  
  try {
    return readdirSync(elixirLSDir)
      .filter(version => version !== "latest")
      .map(version => join(elixirLSDir, version, name));
  } catch {
    return [];
  }
}

// Helper to find executable - package manager agnostic
function findExecutable(name: string, alternativeNames?: string[]): string | null {
  // Build list of names to try (original + alternatives)
  const namesToTry = [name, ...(alternativeNames || [])];
  
  for (const cmdName of namesToTry) {
    // Use 'which' to find in PATH (works with any package manager)
    const whichResult = spawnSync('which', [cmdName], {
      timeout: 1000,
      encoding: 'utf8'
    });
    
    if (whichResult.status === 0 && whichResult.stdout) {
      const path = whichResult.stdout.trim();
      if (path && existsSync(path)) {
        // For language servers, just verify the file exists
        // Many LSP servers don't support --version or --help flags
        if (cmdName.includes("language") || cmdName.includes("server") || 
            cmdName === "intelephense" || cmdName === "solargraph" || 
            cmdName === "metals" || cmdName === "jdtls" || cmdName === "gopls") {
          return path;
        } else {
          // For other tools, try to verify they work
          const testResult = spawnSync(path, ['--version'], {
            timeout: 2000,
            stdio: 'ignore'
          });
          
          // Some commands don't support --version, try --help
          if (testResult.status !== 0) {
            const helpResult = spawnSync(path, ['--help'], {
              timeout: 2000,
              stdio: 'ignore'
            });
            
            if (helpResult.status === 0) {
              return path;
            }
          } else {
            return path;
          }
        }
      }
    }
  }
  
  return null;
}

// Diagnostic capability types
export type DiagnosticScope = 'project-wide' | 'file' | 'both' | 'module-aware';
export type DiagnosticTiming = 'real-time' | 'on-save' | 'on-open' | 'on-save-open';

export interface DiagnosticCapabilities {
  scope: DiagnosticScope;
  timing: DiagnosticTiming;
  features: {
    typeChecking?: boolean;
    compilationErrors?: boolean;
    syntaxErrors?: boolean;
    unusedCode?: boolean;
    linterIntegration?: string[]; // e.g., ['ESLint', 'Pylint']
    nullSafety?: boolean;
    memorySafety?: boolean;
    styleViolations?: boolean;
    importValidation?: boolean;
    documentationChecks?: boolean;
  };
  performance?: {
    speed: 'fast' | 'moderate' | 'slow';
    memoryUsage: 'low' | 'moderate' | 'high';
    startupTime?: 'instant' | 'fast' | 'slow';
  };
  requirements?: {
    projectConfig?: string[]; // e.g., ['tsconfig.json', 'compile_commands.json']
    initialization?: string; // e.g., 'terraform init', 'npm install'
  };
}

export interface LanguageServerConfig {
  name: string;
  command: string;
  args?: string[];
  installCommand?: string | null;
  installCheck?: string;
  alternativeCommands?: string[]; // Alternative command names to check
  projectFiles: string[];
  extensions: string[];
  requiresGlobal?: boolean;
  manualInstallUrl?: string;
  // NEW: Diagnostic capabilities
  diagnostics?: DiagnosticCapabilities;
}

export const languageServers: Record<string, LanguageServerConfig> = {
  typescript: {
    name: "TypeScript",
    command: "typescript-language-server",
    args: ["--stdio"],
    installCommand: null,
    installCheck: "BUNDLED",
    projectFiles: ["tsconfig.json", "package.json", "jsconfig.json"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    diagnostics: {
      scope: 'both',
      timing: 'real-time',
      features: {
        typeChecking: true,
        syntaxErrors: true,
        unusedCode: true,
        linterIntegration: ['ESLint', 'TSLint'],
        importValidation: true,
        documentationChecks: true
      },
      performance: {
        speed: 'fast',
        memoryUsage: 'moderate',
        startupTime: 'fast'
      },
      requirements: {
        projectConfig: ['tsconfig.json', 'jsconfig.json']
      }
    }
  },
  
  python: {
    name: "Python (Pyright)",
    command: "pyright-langserver",
    args: ["--stdio"],
    alternativeCommands: ["pyright", "pyright-python-langserver", "basedpyright", "basedpyright-langserver"],
    installCommand: "npm i -g pyright  # Or: mise use -g node@latest && mise install pyright",
    installCheck: "pyright-langserver",
    projectFiles: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", ".python-version"],
    extensions: [".py", ".pyi"],
    requiresGlobal: true
  },
  
  rust: {
    name: "Rust",
    command: "rust-analyzer",
    args: [],
    // Security: Manual installation required to prevent command injection
    installCommand: null,
    installCheck: "rust-analyzer",
    projectFiles: ["Cargo.toml"],
    extensions: [".rs"],
    requiresGlobal: true,
    manualInstallUrl: "https://github.com/rust-lang/rust-analyzer/releases"
  },
  
  go: {
    name: "Go",
    command: "gopls",
    args: [],
    installCommand: "go install golang.org/x/tools/gopls@latest",
    installCheck: "gopls",
    projectFiles: ["go.mod", "go.sum"],
    extensions: [".go"],
    requiresGlobal: true
  },
  
  java: {
    name: "Java",
    command: "jdtls",
    args: [],
    installCommand: "brew install jdtls",  // macOS; on Linux install manually from Eclipse JDT LS releases
    installCheck: "jdtls",
    projectFiles: ["pom.xml", "build.gradle", "build.gradle.kts", ".classpath"],
    extensions: [".java"],
    requiresGlobal: true,
    manualInstallUrl: "https://projects.eclipse.org/projects/eclipse.jdt.ls"
  },
  
  cpp: {
    name: "C/C++",
    command: "clangd",
    args: [],
    installCommand: "brew install llvm",  // macOS
    installCheck: "clangd",
    projectFiles: ["CMakeLists.txt", "Makefile", "compile_commands.json", ".clang-format"],
    extensions: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx"],
    requiresGlobal: true
  },
  
  ruby: {
    name: "Ruby",
    command: "solargraph",
    args: ["stdio"],
    installCommand: "gem install solargraph",
    installCheck: "solargraph",
    projectFiles: ["Gemfile", ".rubocop.yml", "Rakefile"],
    extensions: [".rb", ".erb", ".rake"],
    requiresGlobal: true
  },
  
  scala: {
    name: "Scala",
    command: "metals",
    args: [],
    installCommand: "cs install metals",  // Coursier installer
    installCheck: "metals",
    projectFiles: ["build.sbt", "build.sc", "project/build.properties", ".bsp"],
    extensions: [".scala", ".sc", ".sbt"],
    requiresGlobal: true
  },
  
  php: {
    name: "PHP",
    command: "intelephense",
    args: ["--stdio"],
    installCommand: "npm i -g intelephense",
    installCheck: "intelephense",
    projectFiles: ["composer.json", ".php-cs-fixer.php"],
    extensions: [".php"],
    requiresGlobal: true
  },
  
  lua: {
    name: "Lua",
    command: "lua-language-server",
    args: [],
    installCommand: null,  // Manual installation required
    installCheck: "lua-language-server",
    projectFiles: [".luarc.json"],
    extensions: [".lua"],
    requiresGlobal: true,
    manualInstallUrl: "https://github.com/LuaLS/lua-language-server/releases"
  },
  
  elixir: {
    name: "Elixir",
    command: "elixir-ls",
    args: [],
    alternativeCommands: ["language_server.sh", "elixir-ls.sh"],
    installCommand: null,  // Manual installation required
    installCheck: "elixir-ls",
    projectFiles: ["mix.exs"],
    extensions: [".ex", ".exs"],
    requiresGlobal: true,
    manualInstallUrl: "https://github.com/elixir-lsp/elixir-ls/releases"
  },
  
  terraform: {
    name: "Terraform",
    command: "terraform-ls",
    args: ["serve"],
    installCommand: "brew install terraform-ls",  // Cross-platform with homebrew
    installCheck: "terraform-ls",
    projectFiles: [".terraform"],
    extensions: [".tf", ".tfvars"],
    requiresGlobal: true,
    manualInstallUrl: "https://github.com/hashicorp/terraform-ls/releases"
  }
};

export function detectProjectLanguages(rootPath: string): string[] {
  const detectedLanguages: string[] = [];
  
  for (const [lang, config] of Object.entries(languageServers)) {
    // Check for project files
    for (const projectFile of config.projectFiles) {
      if (existsSync(join(rootPath, projectFile))) {
        detectedLanguages.push(lang);
        break;
      }
    }
  }
  
  return detectedLanguages;
}

export function isLanguageServerInstalled(language: string): boolean {
  const config = languageServers[language];
  if (!config) return false;
  
  // Special handling for bundled servers
  if (config.installCheck === 'BUNDLED') {
    // Use findExecutable with alternatives to check if the command exists anywhere
    const execPath = findExecutable(config.command, config.alternativeCommands);
    if (execPath) {
      // Update the config with the found path
      languageServers[language].command = execPath;
      return true;
    }
    
    // Fallback: check our own node_modules/.bin directory
    const { basename } = require('path');
    const moduleDir = join(import.meta.dir, '..', 'node_modules');
    const commandName = basename(config.command);
    const binPath = join(moduleDir, '.bin', commandName);
    if (existsSync(binPath)) {
      languageServers[language].command = binPath;
      return true;
    }
    return false;
  }
  
  // Special handling for SKIP - these are auto-downloaded via npx
  if (config.installCheck === 'SKIP') {
    // These servers auto-download via npx, so we always return true
    // The actual check happens when we try to run the command
    return true;
  }
  
  try {
    if (config.requiresGlobal) {
      // Use our helper to find the executable with alternative names
      const execPath = findExecutable(config.command, config.alternativeCommands);
      if (execPath) {
        // Update the config with the found path
        languageServers[language].command = execPath;
        return true;
      }
      return false;
    } else {
      // For local packages, check node_modules
      return existsSync(join(process.cwd(), 'node_modules', config.installCheck || config.command));
    }
  } catch {
    return false;
  }
}

export function getInstallInstructions(language: string, projectPath?: string): string {
  const config = languageServers[language];
  if (!config) return "";
  
  // Special handling for bundled servers
  if (config.installCheck === 'BUNDLED') {
    return `✅ ${config.name} Language Server is bundled with claude-code-lsp - no installation needed`;
  }
  
  // Check for manual installation requirement
  if (config.installCommand === null && config.manualInstallUrl) {
    return `❌ ${config.name} Language Server requires manual installation for security.\nPlease install from: ${config.manualInstallUrl}`;
  }
  
  if (config.requiresGlobal) {
    const restartCommand = projectPath 
      ? `claude-lsp-cli reset ${projectPath}`
      : `claude-lsp-cli reset <project-path>`;
    
    return `
${config.name} Language Server is not installed.

To install it globally, run:
${config.installCommand}

After installation, restart the LSP server by running:
${restartCommand}
`;
  } else {
    return `
${config.name} Language Server is not installed.

To install it in this project, run:
${config.installCommand}

The server will start automatically after installation.
`;
  }
}
