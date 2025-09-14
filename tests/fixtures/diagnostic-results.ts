/**
 * Mock diagnostic results for different languages and scenarios
 */

export interface DiagnosticResult {
  language: string;
  diagnosticCount: number;
  summary: string;
  diagnostics: Array<{
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    code?: string;
  }>;
}

/**
 * TypeScript diagnostic results
 */
export const typescriptResults = {
  /** Clean TypeScript file */
  clean: (): DiagnosticResult => ({
    language: 'typescript',
    diagnosticCount: 0,
    summary: '0 errors, 0 warnings',
    diagnostics: [],
  }),

  /** TypeScript with errors */
  withErrors: (): DiagnosticResult => ({
    language: 'typescript',
    diagnosticCount: 2,
    summary: '2 errors, 0 warnings',
    diagnostics: [
      {
        line: 10,
        column: 5,
        severity: 'error',
        message: "Cannot find name 'undefinedVariable'",
        code: 'TS2304',
      },
      {
        line: 15,
        column: 12,
        severity: 'error',
        message: "Type 'string' is not assignable to type 'number'",
        code: 'TS2322',
      },
    ],
  }),

  /** TypeScript with warnings */
  withWarnings: (): DiagnosticResult => ({
    language: 'typescript',
    diagnosticCount: 1,
    summary: '0 errors, 1 warnings',
    diagnostics: [
      {
        line: 8,
        column: 7,
        severity: 'warning',
        message: "'unusedVariable' is declared but its value is never read",
        code: 'TS6133',
      },
    ],
  }),

  /** Mixed errors and warnings */
  mixed: (): DiagnosticResult => ({
    language: 'typescript',
    diagnosticCount: 3,
    summary: '1 errors, 2 warnings',
    diagnostics: [
      {
        line: 5,
        column: 10,
        severity: 'error',
        message: "Property 'nonexistent' does not exist on type 'Object'",
        code: 'TS2339',
      },
      {
        line: 12,
        column: 3,
        severity: 'warning',
        message: "'oldFunction' is deprecated",
        code: 'TS6385',
      },
      {
        line: 18,
        column: 15,
        severity: 'warning',
        message: "Unused import 'React'",
        code: 'TS6133',
      },
    ],
  }),
};

/**
 * Python diagnostic results
 */
export const pythonResults = {
  /** Clean Python file */
  clean: (): DiagnosticResult => ({
    language: 'python',
    diagnosticCount: 0,
    summary: '0 errors, 0 warnings',
    diagnostics: [],
  }),

  /** Python with syntax errors */
  syntaxErrors: (): DiagnosticResult => ({
    language: 'python',
    diagnosticCount: 1,
    summary: '1 errors, 0 warnings',
    diagnostics: [
      {
        line: 7,
        column: 15,
        severity: 'error',
        message: 'invalid syntax. Perhaps you forgot a comma?',
        code: 'E999',
      },
    ],
  }),

  /** Python with type errors */
  typeErrors: (): DiagnosticResult => ({
    language: 'python',
    diagnosticCount: 2,
    summary: '2 errors, 0 warnings',
    diagnostics: [
      {
        line: 12,
        column: 8,
        severity: 'error',
        message: 'Cannot call function of unknown type',
        code: 'reportGeneralTypeIssues',
      },
      {
        line: 20,
        column: 5,
        severity: 'error',
        message: 'Argument of type "str" cannot be assigned to parameter "count" of type "int"',
        code: 'reportGeneralTypeIssues',
      },
    ],
  }),

  /** Python with import issues */
  importIssues: (): DiagnosticResult => ({
    language: 'python',
    diagnosticCount: 1,
    summary: '1 errors, 0 warnings',
    diagnostics: [
      {
        line: 3,
        column: 1,
        severity: 'error',
        message: 'Import "nonexistent_module" could not be resolved',
        code: 'reportMissingImports',
      },
    ],
  }),
};

/**
 * Go diagnostic results
 */
export const goResults = {
  /** Clean Go file */
  clean: (): DiagnosticResult => ({
    language: 'go',
    diagnosticCount: 0,
    summary: '0 errors, 0 warnings',
    diagnostics: [],
  }),

  /** Go with compilation errors */
  compileErrors: (): DiagnosticResult => ({
    language: 'go',
    diagnosticCount: 1,
    summary: '1 errors, 0 warnings',
    diagnostics: [
      {
        line: 15,
        column: 10,
        severity: 'error',
        message: 'undefined: undeclaredVariable',
        code: 'UndeclaredName',
      },
    ],
  }),

  /** Go with unused variables */
  unusedVars: (): DiagnosticResult => ({
    language: 'go',
    diagnosticCount: 1,
    summary: '1 errors, 0 warnings',
    diagnostics: [
      {
        line: 8,
        column: 2,
        severity: 'error',
        message: 'unusedVar declared and not used',
        code: 'UnusedVar',
      },
    ],
  }),
};

/**
 * JavaScript diagnostic results
 */
export const javascriptResults = {
  /** Clean JavaScript file */
  clean: (): DiagnosticResult => ({
    language: 'javascript',
    diagnosticCount: 0,
    summary: '0 errors, 0 warnings',
    diagnostics: [],
  }),

  /** JavaScript with ESLint errors */
  eslintErrors: (): DiagnosticResult => ({
    language: 'javascript',
    diagnosticCount: 2,
    summary: '2 errors, 0 warnings',
    diagnostics: [
      {
        line: 5,
        column: 3,
        severity: 'error',
        message: "'console' is not defined",
        code: 'no-undef',
      },
      {
        line: 12,
        column: 7,
        severity: 'error',
        message: 'Missing semicolon',
        code: 'semi',
      },
    ],
  }),
};

/**
 * Language results by file extension
 */
export const resultsByExtension = new Map<string, () => DiagnosticResult>([
  ['.ts', typescriptResults.withErrors],
  ['.tsx', typescriptResults.mixed],
  ['.py', pythonResults.typeErrors],
  ['.go', goResults.compileErrors],
  ['.js', javascriptResults.eslintErrors],
  ['.jsx', javascriptResults.clean],
]);

/**
 * Error scenarios for testing error handling
 */
export const errorScenarios = {
  /** Tool execution timeout */
  timeout: new Error('Command timed out after 30 seconds'),

  /** Tool not found */
  toolNotFound: new Error('Command "tsc" not found in PATH'),

  /** File not found */
  fileNotFound: new Error('ENOENT: no such file or directory'),

  /** Permission denied */
  permissionDenied: new Error('EACCES: permission denied'),

  /** Invalid syntax in config */
  invalidConfig: new Error('Invalid JSON syntax in configuration file'),

  /** Network-related error */
  networkError: new Error('ENOTFOUND: getaddrinfo failed'),
};

/**
 * Helper to create diagnostic result for specific language and scenario
 */
export function createDiagnosticResult(
  language: string,
  scenario: 'clean' | 'errors' | 'warnings' | 'mixed' = 'clean',
  customDiagnostics?: DiagnosticResult['diagnostics']
): DiagnosticResult {
  const base = {
    language,
    diagnosticCount: customDiagnostics?.length || 0,
    summary: customDiagnostics
      ? `${customDiagnostics.length} issues found`
      : '0 errors, 0 warnings',
    diagnostics: customDiagnostics || [],
  };

  switch (scenario) {
    case 'errors':
      return {
        ...base,
        diagnosticCount: 1,
        summary: '1 errors, 0 warnings',
        diagnostics: [
          {
            line: 10,
            column: 5,
            severity: 'error',
            message: `Generic ${language} error`,
            code: 'ERROR001',
          },
        ],
      };
    case 'warnings':
      return {
        ...base,
        diagnosticCount: 1,
        summary: '0 errors, 1 warnings',
        diagnostics: [
          {
            line: 15,
            column: 8,
            severity: 'warning',
            message: `Generic ${language} warning`,
            code: 'WARN001',
          },
        ],
      };
    case 'mixed':
      return {
        ...base,
        diagnosticCount: 2,
        summary: '1 errors, 1 warnings',
        diagnostics: [
          {
            line: 10,
            column: 5,
            severity: 'error',
            message: `Generic ${language} error`,
            code: 'ERROR001',
          },
          {
            line: 15,
            column: 8,
            severity: 'warning',
            message: `Generic ${language} warning`,
            code: 'WARN001',
          },
        ],
      };
    default:
      return base;
  }
}
