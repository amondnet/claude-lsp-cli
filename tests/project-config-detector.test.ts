import { describe, test, expect, beforeEach } from "bun:test";
import { ProjectConfigDetector } from "../src/project-config-detector";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ProjectConfigDetector", () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `project-detector-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("TypeScript Project Detection", () => {
    test("should detect TypeScript project with tsconfig.json", async () => {
      writeFileSync(join(testDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2020" }
      }));
      writeFileSync(join(testDir, "package.json"), JSON.stringify({
        name: "test-project"
      }));

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("typescript");
      expect(config?.framework).toBe("node");
    });

    test("should detect React project", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({
        name: "test-react",
        dependencies: {
          "react": "^18.0.0",
          "react-dom": "^18.0.0"
        }
      }));

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("react");
    });

    test("should detect Next.js project", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({
        name: "test-next",
        dependencies: {
          "next": "^14.0.0"
        }
      }));
      writeFileSync(join(testDir, "next.config.js"), "module.exports = {}");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("next");
    });

    test("should detect Vue project", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({
        name: "test-vue",
        dependencies: {
          "vue": "^3.0.0"
        }
      }));

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("vue");
    });
  });

  describe("Python Project Detection", () => {
    test("should detect Python project with requirements.txt", async () => {
      writeFileSync(join(testDir, "requirements.txt"), "flask==2.0.0\nrequests==2.28.0");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("python");
    });

    test("should detect Python project with setup.py", async () => {
      writeFileSync(join(testDir, "setup.py"), "from setuptools import setup\nsetup(name='test')");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("python");
    });

    test("should detect Python project with pyproject.toml", async () => {
      writeFileSync(join(testDir, "pyproject.toml"), "[tool.poetry]\nname = 'test'");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("python");
    });
  });

  describe("Other Language Detection", () => {
    test("should detect Rust project", async () => {
      writeFileSync(join(testDir, "Cargo.toml"), "[package]\nname = 'test'");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("rust");
    });

    test("should detect Go project", async () => {
      writeFileSync(join(testDir, "go.mod"), "module test\n\ngo 1.21");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("go");
    });

    test("should detect Java project", async () => {
      writeFileSync(join(testDir, "pom.xml"), "<project></project>");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("java");
    });

    test("should detect Ruby project", async () => {
      writeFileSync(join(testDir, "Gemfile"), "source 'https://rubygems.org'\ngem 'rails'");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("ruby");
    });

    test("should detect PHP project", async () => {
      writeFileSync(join(testDir, "composer.json"), JSON.stringify({
        name: "test/project",
        require: { php: "^8.0" }
      }));

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("php");
    });

    test("should detect Terraform project", async () => {
      writeFileSync(join(testDir, "main.tf"), 'provider "aws" { region = "us-east-1" }');

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeTruthy();
      expect(config?.language).toBe("terraform");
    });
  });

  describe("Edge Cases", () => {
    test("should return null for empty directory", async () => {
      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config).toBeNull();
    });

    test("should handle non-existent directory gracefully", async () => {
      const detector = new ProjectConfigDetector("/non/existent/path");
      const config = await detector.detect();

      expect(config).toBeNull();
    });

    test("should prioritize TypeScript over JavaScript", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test" }));
      writeFileSync(join(testDir, "tsconfig.json"), "{}");
      writeFileSync(join(testDir, "index.js"), "console.log('js')");
      writeFileSync(join(testDir, "index.ts"), "console.log('ts')");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config?.language).toBe("typescript");
    });

    test("should detect based on file extensions if no config files", async () => {
      writeFileSync(join(testDir, "main.py"), "print('hello')");
      writeFileSync(join(testDir, "utils.py"), "def helper(): pass");

      const detector = new ProjectConfigDetector(testDir);
      const config = await detector.detect();

      expect(config?.language).toBe("python");
    });
  });
});