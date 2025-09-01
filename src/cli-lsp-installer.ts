/**
 * CLI LSP Installer
 * 
 * Manages installation and listing of individual language servers.
 * These are the actual language servers (TypeScript, Python, etc.) 
 * that the claude-lsp-server will manage.
 */

import { languageServers, isLanguageServerInstalled, detectProjectLanguages, getInstallInstructions } from "./language-servers";

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
  const installed = isLanguageServerInstalled(language);
  if (installed) {
    console.log(`✅ ${config.name} is already installed.`);
    return;
  }
  console.log(`\n${config.name} (${language})`);
  console.log("- How to enable:");
  console.log(getInstallInstructions(language));
}

/**
 * Install all available language servers
 */
export async function installAllLanguageServers(): Promise<void> {
  console.log("\nEnable Language Servers (instructions only):\n");
  for (const [language, config] of Object.entries(languageServers)) {
    const installed = isLanguageServerInstalled(language);
    console.log(`${installed ? '✅' : '❌'} ${config.name} (${language})`);
    if (!installed) {
      console.log(getInstallInstructions(language));
    }
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
    const installed = await isLanguageServerInstalled(language);
    const status = installed ? "✅ Installed" : "❌ Not installed";
    
    console.log(`${status} ${config.name} (${language})`);
    
    if (!installed) {
      const instructions = getInstallInstructions(language).trim();
      for (const line of instructions.split('\n')) {
        if (line.trim()) console.log(`            ${line}`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(40));
  console.log("Show instructions for one language: claude-lsp-cli install <language>");
  console.log("Show instructions for all: claude-lsp-cli install-all");
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
  // Keep list-projects simple and non-overlapping with help/install commands
  // Output just the array of project paths
  console.log(JSON.stringify(projects, null, 2));
}
