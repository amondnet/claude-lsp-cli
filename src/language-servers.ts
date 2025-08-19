import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Helper to find executable in common locations
function findExecutable(name: string): string | null {
  const possiblePaths = [
    // Standard PATH
    name,
    // Go paths
    join(process.env.HOME || "", "go", "bin", name),
    join(process.env.GOPATH || "", "bin", name),
    // Cargo/Rust paths
    join(process.env.HOME || "", ".cargo", "bin", name),
    // Coursier paths (for Scala/Java tools)
    join(process.env.HOME || "", "Library", "Application Support", "Coursier", "bin", name),
    // mise/asdf paths
    join(process.env.HOME || "", ".local", "share", "mise", "shims", name),
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
        timeout: 1000,
        stdio: 'ignore'
      });
      
      if (result.status === 0) {
        return path;
      }
    }
  }
  
  return null;
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
}

export const languageServers: Record<string, LanguageServerConfig> = {
  typescript: {
    name: "TypeScript",
    command: "bun",
    args: ["x", "typescript-language-server", "--stdio"],
    installCommand: "bun add typescript-language-server typescript",
    installCheck: "typescript-language-server",
    projectFiles: ["tsconfig.json", "package.json", "jsconfig.json"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
  },
  
  python: {
    name: "Python (Pyright)",
    command: "bun",
    args: ["x", "pyright-langserver", "--stdio"],
    installCommand: "bun add pyright",
    installCheck: "pyright/langserver.index.js",
    projectFiles: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", ".python-version"],
    extensions: [".py", ".pyi"]
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
  
  csharp: {
    name: "C#",
    command: "omnisharp",
    args: ["--languageserver", "--hostPID", process.pid.toString()],
    installCommand: "brew install omnisharp",  // macOS, different for other OS
    installCheck: "omnisharp",
    projectFiles: ["*.csproj", "*.sln", "*.fsproj", "*.vbproj"],
    extensions: [".cs", ".csx", ".fs", ".fsx", ".vb"],
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
    command: "bun",
    args: ["x", "intelephense", "--stdio"],
    installCommand: "bun add intelephense",
    installCheck: "intelephense",
    projectFiles: ["composer.json", ".php-cs-fixer.php"],
    extensions: [".php"],
  },
  
  html: {
    name: "HTML",
    command: "bun",
    args: ["x", "vscode-html-language-server", "--stdio"],
    installCommand: "bun add vscode-html-languageserver-bin",
    installCheck: "vscode-html-language-server",
    projectFiles: [],
    extensions: [".html", ".htm"]
  },
  
  css: {
    name: "CSS",
    command: "bun",
    args: ["x", "vscode-css-language-server", "--stdio"],
    installCommand: "bun add vscode-css-languageserver-bin",
    installCheck: "vscode-css-language-server",
    projectFiles: [],
    extensions: [".css", ".scss", ".sass", ".less"]
  },
  
  json: {
    name: "JSON",
    command: "bun",
    args: ["x", "vscode-json-language-server", "--stdio"],
    installCommand: "bun add vscode-json-languageserver",
    installCheck: "vscode-json-language-server",
    projectFiles: [],
    extensions: [".json", ".jsonc", ".json5"]
  },
  
  yaml: {
    name: "YAML",
    command: "bun",
    args: ["x", "yaml-language-server", "--stdio"],
    installCommand: "bun add yaml-language-server",
    installCheck: "yaml-language-server",
    projectFiles: [],
    extensions: [".yml", ".yaml"]
  },
  
  vue: {
    name: "Vue",
    command: "bun",
    args: ["x", "vue-language-server", "--stdio"],
    installCommand: "bun add @vue/language-server",
    installCheck: "vue-language-server",
    projectFiles: ["vue.config.js", "nuxt.config.js"],
    extensions: [".vue"]
  },
  
  svelte: {
    name: "Svelte",
    command: "bun",
    args: ["x", "svelteserver", "--stdio"],
    installCommand: "bun add svelte-language-server",
    installCheck: "svelteserver",
    projectFiles: ["svelte.config.js"],
    extensions: [".svelte"]
  },
  
  dockerfile: {
    name: "Docker",
    command: "docker-langserver",
    args: ["--stdio"],
    installCommand: "npm install -g dockerfile-language-server-nodejs",
    installCheck: "docker-langserver",
    projectFiles: ["Dockerfile", "docker-compose.yml"],
    extensions: [".dockerfile"],
    requiresGlobal: true
  },
  
  bash: {
    name: "Bash",
    command: "bash-language-server",
    args: ["start"],
    installCommand: "npm install -g bash-language-server",
    installCheck: "bash-language-server",
    projectFiles: [],
    extensions: [".sh", ".bash", ".zsh"],
    requiresGlobal: true
  },
  
  lua: {
    name: "Lua",
    command: "lua-language-server",
    args: [],
    installCommand: "brew install lua-language-server",  // macOS
    installCheck: "lua-language-server",
    projectFiles: [".luarc.json"],
    extensions: [".lua"],
    requiresGlobal: true
  },
  
  kotlin: {
    name: "Kotlin",
    command: "kotlin-language-server",
    args: [],
    installCommand: "brew install kotlin-language-server",  // macOS
    installCheck: "kotlin-language-server",
    projectFiles: ["build.gradle.kts", "settings.gradle.kts"],
    extensions: [".kt", ".kts"],
    requiresGlobal: true
  },
  
  swift: {
    name: "Swift",
    command: "sourcekit-lsp",
    args: [],
    installCommand: "# Comes with Xcode on macOS",
    installCheck: "sourcekit-lsp",
    projectFiles: ["Package.swift"],
    extensions: [".swift"],
    requiresGlobal: true
  },
  
  zig: {
    name: "Zig",
    command: "zls",
    args: [],
    installCommand: "brew install zls",  // macOS
    installCheck: "zls",
    projectFiles: ["build.zig"],
    extensions: [".zig"],
    requiresGlobal: true
  },
  
  elixir: {
    name: "Elixir",
    command: "elixir-ls",
    args: [],
    installCommand: "# See https://github.com/elixir-lsp/elixir-ls for installation",
    installCheck: "elixir-ls",
    projectFiles: ["mix.exs"],
    extensions: [".ex", ".exs"],
    requiresGlobal: true
  },
  
  terraform: {
    name: "Terraform",
    command: "terraform-ls",
    args: ["serve"],
    installCommand: "brew install hashicorp/tap/terraform-ls",  // macOS
    installCheck: "terraform-ls",
    projectFiles: [".terraform"],
    extensions: [".tf", ".tfvars"],
    requiresGlobal: true
  },
  
  markdown: {
    name: "Markdown",
    command: "bun",
    args: ["x", "unified-language-server", "--stdio"],
    installCommand: "bun add unified-language-server",
    installCheck: "unified-language-server",
    projectFiles: [],
    extensions: [".md", ".markdown"]
  },
  
  graphql: {
    name: "GraphQL",
    command: "graphql-lsp",
    args: ["server", "-m", "stream"],
    installCommand: "npm install -g graphql-language-service-cli",
    installCheck: "graphql-lsp",
    projectFiles: [".graphqlrc", ".graphqlconfig", "graphql.config.js"],
    extensions: [".graphql", ".gql"],
    requiresGlobal: true
  },
  
  prisma: {
    name: "Prisma",
    command: "bun",
    args: ["x", "prisma-language-server", "--stdio"],
    installCommand: "bun add @prisma/language-server",
    installCheck: "prisma-language-server",
    projectFiles: ["prisma/schema.prisma"],
    extensions: [".prisma"]
  },
  
  toml: {
    name: "TOML",
    command: "taplo",
    args: ["lsp", "stdio"],
    installCommand: "cargo install taplo-cli --locked",
    installCheck: "taplo",
    projectFiles: [],
    extensions: [".toml"],
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