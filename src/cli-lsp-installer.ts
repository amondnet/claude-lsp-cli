/**
 * CLI LSP Installer
 * 
 * Manages installation and listing of individual language servers.
 * These are the actual language servers (TypeScript, Python, etc.) 
 * that the claude-lsp-server will manage.
 */

import { spawn } from "child_process";
import { languageServers, isLanguageServerInstalled } from "./language-servers";

/**
 * Install a specific language server
 */
export async function installLanguageServer(language: string): Promise<void> {
  const config = languageServers[language];
  if (!config) {
    console.error(`Unknown language: ${language}`);
    console.log("Use 'claude-lsp-cli list-servers' to see available languages");
    return;
  }
  
  console.log(`Installing ${config.name} Language Server...`);
  
  // Handle different installation methods
  if (config.installCheck === 'SKIP') {
    console.log("✅ This language server uses auto-download via bunx/npx - no installation needed");
    return;
  }
  
  if (config.installCommand === null && config.manualInstallUrl) {
    console.log(`❌ ${config.name} requires manual installation for security.`);
    console.log(`Please install from: ${config.manualInstallUrl}`);
    return;
  }
  
  if (!config.installCommand) {
    console.log(`❌ No installation method available for ${config.name}`);
    return;
  }
  
  // Parse and execute install command
  console.log(`Running: ${config.installCommand}`);
  const parts = config.installCommand.split(' ');
  const [cmd, ...args] = parts;
  
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false
    });
    
    proc.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ ${config.name} Language Server installed successfully!`);
        resolve();
      } else {
        console.error(`❌ Installation failed with exit code ${code}`);
        reject(new Error(`Installation failed with exit code ${code}`));
      }
    });
    
    proc.on('error', (error) => {
      console.error(`❌ Failed to run installation command: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Install all available language servers
 */
export async function installAllLanguageServers(): Promise<void> {
  const installable = Object.entries(languageServers)
    .filter(([_, config]) => 
      config.installCommand && 
      config.installCommand !== "Automatic - uses bunx cache" &&
      config.installCheck !== 'SKIP'
    );
  
  console.log(`Installing ${installable.length} language servers...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const [language, config] of installable) {
    console.log(`\nInstalling ${config.name}...`);
    try {
      await installLanguageServer(language);
      successCount++;
    } catch (error) {
      console.error(`Failed to install ${config.name}`);
      failCount++;
    }
  }
  
  console.log("\n" + "=".repeat(40));
  console.log(`Installation Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  if (failCount > 0) {
    console.log(`   ❌ Failed: ${failCount}`);
  }
}

/**
 * List all available language servers and their installation status
 */
export async function listLanguageServers(): Promise<void> {
  console.log("\nAvailable Language Servers:");
  console.log("============================\n");
  
  const entries = Object.entries(languageServers).sort((a, b) => 
    a[1].name.localeCompare(b[1].name)
  );
  
  for (const [language, config] of entries) {
    const installed = await isLanguageServerInstalled(config);
    const status = installed ? "✅ Installed" : "❌ Not installed";
    
    console.log(`${status} ${config.name} (${language})`);
    
    if (!installed) {
      if (config.installCommand) {
        if (config.installCheck === 'SKIP') {
          console.log(`            Auto-downloads on first use`);
        } else {
          console.log(`            Install: claude-lsp-cli install ${language}`);
        }
      } else if (config.manualInstallUrl) {
        console.log(`            Manual install: ${config.manualInstallUrl}`);
      } else {
        console.log(`            No installation method available`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(40));
  console.log("To install a specific server: claude-lsp-cli install <language>");
  console.log("To install all servers: claude-lsp-cli install-all");
}

/**
 * Get project scope for LSP (find files that would be analyzed)
 */
export async function getLspScope(projectPath: string): Promise<any> {
  const { readdirSync } = await import("fs");
  const { resolve, relative, join } = await import("path");
  
  const absolutePath = resolve(projectPath);
  
  // Build the scope object
  const scope = {
    root: absolutePath,
    exclusions: [] as string[]
  };
  
  // Find nested projects within this project to exclude them
  const nestedProjects = await findNestedProjects(absolutePath);
  
  // Exclude any nested projects found (they should have their own LSP scope)
  for (const nested of nestedProjects) {
    if (nested !== absolutePath && nested.startsWith(absolutePath)) {
      scope.exclusions.push(relative(absolutePath, nested));
    }
  }
  
  return scope;
}

/**
 * Find all projects in a directory (helper for scope detection)
 */
async function findNestedProjects(baseDir: string): Promise<string[]> {
  const { existsSync } = await import('fs');
  const { join } = await import('path');
  
  const projectMarkers = [
    'package.json', 'tsconfig.json', 'cargo.toml', 'go.mod', 
    'pom.xml', 'requirements.txt', '.git'
  ];
  
  const projects: string[] = [];
  
  // Check if baseDir itself is a project
  for (const marker of projectMarkers) {
    if (existsSync(join(baseDir, marker))) {
      projects.push(baseDir);
      break;
    }
  }
  
  // Note: This is a simplified version. The full implementation
  // would recursively search subdirectories for nested projects.
  
  return projects;
}

/**
 * List all projects found in a directory
 */
export async function listProjects(baseDir: string): Promise<void> {
  const { resolve } = await import("path");
  
  const absolutePath = resolve(baseDir);
  const projects = await findNestedProjects(absolutePath);
  
  // Output as JSON array for consumption by tests or other tools
  console.log(JSON.stringify(projects, null, 2));
}