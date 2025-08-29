/**
 * Diagnostic capabilities for all supported language servers
 * This provides runtime information about how each LSP handles diagnostics
 */

import { DiagnosticCapabilities } from './language-servers';

export const diagnosticCapabilities: Record<string, DiagnosticCapabilities> = {
  typescript: {
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
  },

  python: {
    scope: 'file',
    timing: 'on-save-open',
    features: {
      syntaxErrors: true,
      unusedCode: true,
      linterIntegration: ['pylint', 'flake8', 'pycodestyle', 'mypy'],
      importValidation: true,
      typeChecking: true
    },
    performance: {
      speed: 'moderate',
      memoryUsage: 'low',
      startupTime: 'fast'
    }
  },

  rust: {
    scope: 'project-wide',
    timing: 'real-time',
    features: {
      compilationErrors: true,
      typeChecking: true,
      syntaxErrors: true,
      unusedCode: true,
      memorySafety: true,
      linterIntegration: ['Clippy']
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'moderate',
      startupTime: 'moderate'
    },
    requirements: {
      projectConfig: ['Cargo.toml']
    }
  },

  go: {
    scope: 'both',
    timing: 'real-time',
    features: {
      compilationErrors: true,
      typeChecking: true,
      syntaxErrors: true,
      unusedCode: true,
      importValidation: true,
      linterIntegration: ['go vet', 'staticcheck', 'golint']
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'low',
      startupTime: 'instant'
    }
  },

  java: {
    scope: 'project-wide',
    timing: 'real-time',
    features: {
      compilationErrors: true,
      typeChecking: true,
      syntaxErrors: true,
      unusedCode: true,
      nullSafety: true,
      styleViolations: true
    },
    performance: {
      speed: 'moderate',
      memoryUsage: 'high',
      startupTime: 'slow'
    },
    requirements: {
      projectConfig: ['pom.xml', 'build.gradle'],
      initialization: 'mvn install or gradle build'
    }
  },

  cpp: {
    scope: 'file',
    timing: 'real-time',
    features: {
      compilationErrors: true,
      syntaxErrors: true,
      typeChecking: true,
      memorySafety: true,
      unusedCode: true,
      linterIntegration: ['clang-tidy']
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'moderate',
      startupTime: 'fast'
    },
    requirements: {
      projectConfig: ['compile_commands.json', 'CMakeLists.txt']
    }
  },

  ruby: {
    scope: 'both',
    timing: 'on-save-open',
    features: {
      syntaxErrors: true,
      unusedCode: true,
      typeChecking: true,
      linterIntegration: ['RuboCop'],
      documentationChecks: true
    },
    performance: {
      speed: 'moderate',
      memoryUsage: 'moderate',
      startupTime: 'moderate'
    }
  },

  scala: {
    scope: 'project-wide',
    timing: 'real-time',
    features: {
      compilationErrors: true,
      typeChecking: true,
      syntaxErrors: true,
      unusedCode: true,
      styleViolations: true,
      linterIntegration: ['Scalafmt', 'Scalafix']
    },
    performance: {
      speed: 'slow',
      memoryUsage: 'high',
      startupTime: 'slow'
    },
    requirements: {
      projectConfig: ['build.sbt', 'build.sc'],
      initialization: 'sbt compile'
    }
  },

  php: {
    scope: 'file',
    timing: 'on-save-open',
    features: {
      syntaxErrors: true,
      typeChecking: true,
      unusedCode: true,
      styleViolations: true,
      importValidation: true
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'low',
      startupTime: 'instant'
    }
  },

  lua: {
    scope: 'both',
    timing: 'real-time',
    features: {
      syntaxErrors: true,
      typeChecking: true,
      unusedCode: true,
      importValidation: true,
      documentationChecks: true
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'low',
      startupTime: 'instant'
    }
  },

  elixir: {
    scope: 'project-wide',
    timing: 'on-save',
    features: {
      compilationErrors: true,
      syntaxErrors: true,
      unusedCode: true,
      linterIntegration: ['Credo', 'Dialyzer']
    },
    performance: {
      speed: 'moderate',
      memoryUsage: 'moderate',
      startupTime: 'slow'
    },
    requirements: {
      projectConfig: ['mix.exs'],
      initialization: 'mix deps.get'
    }
  },

  terraform: {
    scope: 'module-aware',
    timing: 'real-time',
    features: {
      syntaxErrors: true,
      typeChecking: true,
      importValidation: true,
      documentationChecks: true
    },
    performance: {
      speed: 'fast',
      memoryUsage: 'low',
      startupTime: 'fast'
    },
    requirements: {
      initialization: 'terraform init'
    }
  }
};

/**
 * Get diagnostic capabilities for a specific language
 */
export function getDiagnosticCapabilities(language: string): DiagnosticCapabilities | undefined {
  return diagnosticCapabilities[language];
}

/**
 * Check if a language server supports file-specific diagnostics efficiently
 */
export function supportsFileSpecificDiagnostics(language: string): boolean {
  const caps = diagnosticCapabilities[language];
  return caps?.scope === 'file' || caps?.scope === 'both';
}

/**
 * Check if a language server supports project-wide diagnostics
 */
export function supportsProjectWideDiagnostics(language: string): boolean {
  const caps = diagnosticCapabilities[language];
  return caps?.scope === 'project-wide' || caps?.scope === 'both' || caps?.scope === 'module-aware';
}

/**
 * Check if a language server provides real-time diagnostics
 */
export function isRealTimeDiagnostics(language: string): boolean {
  const caps = diagnosticCapabilities[language];
  return caps?.timing === 'real-time';
}

/**
 * Get recommended wait time for diagnostics based on language server
 */
export function getDiagnosticWaitTime(language: string): number {
  const caps = diagnosticCapabilities[language];
  
  if (!caps) return 2000; // Default 2 seconds
  
  // Real-time diagnostics need less wait time
  if (caps.timing === 'real-time') {
    switch (caps.performance?.speed) {
      case 'fast': return 500;
      case 'moderate': return 1000;
      case 'slow': return 2000;
      default: return 1000;
    }
  }
  
  // On-save diagnostics need more wait time
  if (caps.timing === 'on-save' || caps.timing === 'on-save-open') {
    switch (caps.performance?.speed) {
      case 'fast': return 1000;
      case 'moderate': return 2000;
      case 'slow': return 4000;
      default: return 2000;
    }
  }
  
  return 2000;
}

/**
 * Check if a language server needs special initialization
 */
export function needsInitialization(language: string): string | undefined {
  const caps = diagnosticCapabilities[language];
  return caps?.requirements?.initialization;
}

/**
 * Get required project configuration files
 */
export function getRequiredProjectConfig(language: string): string[] {
  const caps = diagnosticCapabilities[language];
  return caps?.requirements?.projectConfig || [];
}