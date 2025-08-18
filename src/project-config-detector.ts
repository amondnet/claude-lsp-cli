#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join } from "path";

export interface ProjectConfig {
  language: "typescript" | "javascript" | "react" | "next" | "vue" | "python" | "rust" | "go";
  hasJSX: boolean;
  framework?: "react" | "next" | "vue" | "svelte";
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  tsConfig?: any;
  eslintConfig?: any;
  requiredLSPSettings: Record<string, any>;
}

export class ProjectConfigDetector {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async detect(): Promise<ProjectConfig> {
    const packageJson = this.readPackageJson();
    const tsConfig = this.readTsConfig();
    const eslintConfig = this.readEslintConfig();

    // Detect language and framework
    const language = this.detectLanguage(packageJson, tsConfig);
    const framework = this.detectFramework(packageJson);
    const hasJSX = this.detectJSX(packageJson, tsConfig, framework);
    const packageManager = this.detectPackageManager();

    // Generate LSP settings based on detection
    const requiredLSPSettings = this.generateLSPSettings({
      language,
      hasJSX,
      framework,
      tsConfig,
      eslintConfig
    });

    return {
      language,
      hasJSX,
      framework,
      packageManager,
      tsConfig,
      eslintConfig,
      requiredLSPSettings
    };
  }

  private readPackageJson(): any {
    const packagePath = join(this.projectRoot, "package.json");
    if (!existsSync(packagePath)) return null;
    
    try {
      return JSON.parse(readFileSync(packagePath, "utf8"));
    } catch {
      return null;
    }
  }

  private readTsConfig(): any {
    const tsConfigPath = join(this.projectRoot, "tsconfig.json");
    if (!existsSync(tsConfigPath)) return null;
    
    try {
      return JSON.parse(readFileSync(tsConfigPath, "utf8"));
    } catch {
      return null;
    }
  }

  private readEslintConfig(): any {
    const eslintPaths = [
      ".eslintrc.json",
      ".eslintrc.js",
      ".eslintrc.yml",
      ".eslintrc.yaml"
    ];

    for (const configFile of eslintPaths) {
      const configPath = join(this.projectRoot, configFile);
      if (existsSync(configPath)) {
        try {
          if (configFile.endsWith('.json')) {
            return JSON.parse(readFileSync(configPath, "utf8"));
          }
          // For JS/YML configs, just return that they exist
          return { exists: true, path: configPath };
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private detectLanguage(packageJson: any, tsConfig: any): ProjectConfig["language"] {
    // Check for TypeScript indicators
    if (tsConfig) return "typescript";
    
    if (packageJson) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.typescript || deps["@types/node"]) return "typescript";
      if (deps.next) return "next";
      if (deps.react) return "react";
      if (deps.vue) return "vue";
    }

    // Check for files
    if (existsSync(join(this.projectRoot, "Cargo.toml"))) return "rust";
    if (existsSync(join(this.projectRoot, "go.mod"))) return "go";
    if (existsSync(join(this.projectRoot, "requirements.txt")) || 
        existsSync(join(this.projectRoot, "pyproject.toml"))) return "python";

    return "javascript";
  }

  private detectFramework(packageJson: any): ProjectConfig["framework"] | undefined {
    if (!packageJson) return undefined;
    
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (deps.next) return "next";
    if (deps.react) return "react";
    if (deps.vue) return "vue";
    if (deps.svelte) return "svelte";
    
    return undefined;
  }

  private detectJSX(packageJson: any, tsConfig: any, framework?: string): boolean {
    // If it's a React-based framework, it uses JSX
    if (framework === "react" || framework === "next") return true;
    
    // Check TypeScript config
    if (tsConfig?.compilerOptions?.jsx) return true;
    
    // Check for JSX/TSX files
    const jsxFiles = [".jsx", ".tsx"].some(ext => 
      existsSync(join(this.projectRoot, `src/App${ext}`)) ||
      existsSync(join(this.projectRoot, `pages/index${ext}`)) ||
      existsSync(join(this.projectRoot, `app/page${ext}`))
    );
    
    return jsxFiles;
  }

  private detectPackageManager(): ProjectConfig["packageManager"] {
    if (existsSync(join(this.projectRoot, "bun.lockb"))) return "bun";
    if (existsSync(join(this.projectRoot, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(this.projectRoot, "yarn.lock"))) return "yarn";
    return "npm";
  }

  private generateLSPSettings(config: {
    language: string;
    hasJSX: boolean;
    framework?: string;
    tsConfig?: any;
    eslintConfig?: any;
  }): Record<string, any> {
    const settings: Record<string, any> = {};

    // TypeScript LSP settings
    if (config.language === "typescript" || config.hasJSX) {
      settings.typescript = {
        preferences: {
          includePackageJsonAutoImports: "on"
        },
        suggest: {
          autoImports: true
        }
      };

      // JSX settings
      if (config.hasJSX) {
        settings.typescript.preferences.jsx = "react";
        
        // Auto-configure JSX if not set in tsconfig
        if (!config.tsConfig?.compilerOptions?.jsx) {
          settings.typescript.preferences.jsxAttributeCompletionStyle = "auto";
        }
      }
    }

    // ESLint settings
    if (config.eslintConfig) {
      settings.eslint = {
        enable: true,
        autoFixOnSave: false,
        codeActionsOnSave: {
          mode: "problems"
        }
      };
    }

    // Framework-specific settings
    if (config.framework === "next") {
      settings.next = {
        enableServerComponents: true
      };
    }

    return settings;
  }

  async createAutoTsConfig(): Promise<void> {
    const tsConfigPath = join(this.projectRoot, "tsconfig.json");
    
    // Don't overwrite existing tsconfig
    if (existsSync(tsConfigPath)) return;
    
    const config = await this.detect();
    
    // Generate appropriate tsconfig based on project type
    const tsConfig = {
      compilerOptions: {
        target: "ES2020",
        lib: ["ES2020", "DOM"],
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        isolatedModules: true,
        ...(config.hasJSX && {
          jsx: "react-jsx",
          allowJs: true
        }),
        ...(config.framework === "next" && {
          incremental: true,
          plugins: [{ name: "next" }]
        })
      },
      include: [
        "**/*.ts",
        ...(config.hasJSX ? ["**/*.tsx", "**/*.jsx"] : []),
        "**/*.js"
      ],
      exclude: ["node_modules"]
    };

    await Bun.write(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }
}