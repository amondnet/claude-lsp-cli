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

// Helper to find executable in common locations
function findExecutable(name: string): string | null {
  const possiblePaths = [
    // Standard PATH
    name,
    // Bun global bin path
    join(process.env.HOME || "", ".bun", "bin", name),
    // Go paths
    join(process.env.HOME || "", "go", "bin", name),
    join(process.env.GOPATH || "", "bin", name),
    // Cargo/Rust paths
    join(process.env.HOME || "", ".cargo", "bin", name),
    // Coursier paths (for Scala/Java tools)
    join(process.env.HOME || "", "Library", "Application Support", "Coursier", "bin", name),
    // mise/asdf paths
    join(process.env.HOME || "", ".local", "share", "mise", "shims", name),
    // mise elixir-ls specific paths (try common version patterns)
    join(process.env.HOME || "", ".local", "share", "mise", "installs", "elixir-ls", "latest", name),
    // Dynamic elixir-ls version detection
    ...getElixirLSVersionPaths(name),
    // Homebrew paths
    "/opt/homebrew/bin/" + name,
    "/usr/local/bin/" + name,
    // System paths
    "/usr/bin/" + name,
  ];
  
  for (const path of possiblePaths) {
    if (path.includes(process.env.HOME || "") && !process.env.HOME) continue;
    
    // Try different version check approaches
    const versionCommands = [
      ["--version"],
      ["version"],
      ["-v"],
      ["--help"]
    ];
    
    for (const args of versionCommands) {
      const result = spawnSync(path, args, { 
        timeout: 2000,
        stdio: 'ignore'
      });
      
      if (result.status === 0) {
        return path;
      }
    }
    
    // Special case for ElixirLS - it starts outputting LSP messages instead of help
    if (path.includes("language_server.sh")) {
      const result = spawnSync(path, [], { 
        timeout: 500,
        stdio: 'ignore'
      });
      // ElixirLS always exits with 0 and outputs JSON-RPC messages
      if (result.status === 0 || result.signal === 'SIGTERM') {
        return path;
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
  projectFiles: string[];
  extensions: string[];
  requiresGlobal?: boolean;
  manualInstallUrl?: string;
  // NEW: Diagnostic capabilities
  diagnostics?: DiagnosticCapabilities;
}

// Dynamic command resolution for TypeScript
function getTypeScriptCommand(): { command: string; args: string[] } {
  // Check if typescript-language-server is available directly
  const tsServerPath = findExecutable("typescript-language-server");
  if (tsServerPath) {
    return { command: tsServerPath, args: ["--stdio"] };
  }
  
  // Fallback to npx
  return { command: "npx", args: ["-y", "typescript-language-server", "--stdio"] };
}

export const languageServers: Record<string, LanguageServerConfig> = {
  typescript: {
    name: "TypeScript",
    command: getTypeScriptCommand().command,
    args: getTypeScriptCommand().args,
    installCommand: null,
    installCheck: "SKIP",
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
    name: "Python (pylsp)",
    command: "pylsp",
    args: [],
    installCommand: "pip install python-lsp-server",
    installCheck: "pylsp",
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
    installCommand: "brew install jdtls",  // macOS, different for other OS
    installCheck: "jdtls",
    projectFiles: ["pom.xml", "build.gradle", "build.gradle.kts", ".classpath"],
    extensions: [".java"],
    requiresGlobal: true
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
    command: "npx",
    args: ["-y", "intelephense", "--stdio"],
    installCommand: "Auto-download via npx",
    installCheck: "SKIP",
    projectFiles: ["composer.json", ".php-cs-fixer.php"],
    extensions: [".php"],
  },
  
  lua: {
    name: "Lua",
    command: "lua-language-server",
    args: [],
    installCommand: "mise install lua-language-server@latest && mise use -g lua-language-server@latest",
    installCheck: "lua-language-server",
    projectFiles: [".luarc.json"],
    extensions: [".lua"],
    requiresGlobal: true
  },
  
  elixir: {
    name: "Elixir",
    command: "language_server.sh",
    args: [],
    installCommand: "mise install elixir-ls@latest && mise use -g elixir-ls@latest",
    installCheck: "language_server.sh",
    projectFiles: ["mix.exs"],
    extensions: [".ex", ".exs"],
    requiresGlobal: true
  },
  
  terraform: {
    name: "Terraform",
    command: "terraform-ls",
    args: ["serve"],
    installCommand: "mise install terraform-ls@latest && mise use -g terraform-ls@latest",
    installCheck: "terraform-ls",
    projectFiles: [".terraform"],
    extensions: [".tf", ".tfvars"],
    requiresGlobal: true
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
    // These are included in our package.json dependencies
    // Check if we can find them in our own node_modules
    const moduleDir = join(import.meta.dir, '..', 'node_modules');
    const binPath = join(moduleDir, '.bin', config.command);
    if (existsSync(binPath)) {
      // Update command to use full path
      languageServers[language].command = binPath;
      return true;
    }
    return false;
  }
  
  try {
    if (config.requiresGlobal) {
      // Use our helper to find the executable
      const execPath = findExecutable(config.command);
      if (execPath) {
        // Update the config with the found path
        languageServers[language].command = execPath;
        return true;
      }
      return false;
    } else {
      // For bun packages, check node_modules
      return existsSync(join(process.cwd(), 'node_modules', config.installCheck || config.command));
    }
  } catch {
    return false;
  }
}

export function getInstallInstructions(language: string): string {
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
    return `
${config.name} Language Server is not installed.

To install it globally, run:
${config.installCommand}

After installation, restart the LSP server.
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