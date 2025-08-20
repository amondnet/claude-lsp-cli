/**
 * Logging utility for Claude Code LSP
 * Provides structured logging with proper error handling
 */

import { appendFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

export class Logger {
  private static instance: Logger;
  private logFile: string;
  private logLevel: LogLevel;
  private projectName: string;
  
  private constructor() {
    const logDir = '/tmp/claude-lsp-logs';
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFile = join(logDir, `claude-lsp-${timestamp}.log`);
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
    this.projectName = 'claude-lsp';
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  setProject(projectName: string): void {
    this.projectName = projectName;
  }
  
  private async writeLog(level: LogLevel, message: string, context?: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      project: this.projectName,
      message,
      ...(context && { context })
    };
    
    // Skip ALL console output when running as a hook (to avoid polluting Claude's output)
    const isHookMode = process.env.CLAUDE_LSP_HOOK_MODE === 'true';
    const shouldOutputToConsole = !isHookMode;
    
    if (shouldOutputToConsole) {
      // Console output with color coding
      const colorCode = {
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.WARN]: '\x1b[33m',  // Yellow
        [LogLevel.INFO]: '\x1b[36m',  // Cyan
        [LogLevel.DEBUG]: '\x1b[90m'  // Gray
      };
      
      const resetColor = '\x1b[0m';
      console.log(
        `${colorCode[level]}[${timestamp}] [${level}] ${this.projectName}: ${message}${resetColor}`,
        context ? context : ''
      );
    }
    
    // File output
    try {
      await appendFile(this.logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      // If file logging fails, at least we have console output
      if (shouldOutputToConsole) {
        console.error('Failed to write to log file:', error);
      }
    }
  }
  
  async error(message: string, error?: Error | any, context?: any): Promise<void> {
    const errorContext = {
      ...context,
      ...(error && {
        error: {
          message: error.message || String(error),
          stack: error.stack,
          ...(error.code && { code: error.code })
        }
      })
    };
    
    await this.writeLog(LogLevel.ERROR, message, errorContext);
  }
  
  async warn(message: string, context?: any): Promise<void> {
    await this.writeLog(LogLevel.WARN, message, context);
  }
  
  async info(message: string, context?: any): Promise<void> {
    if (this.shouldLog(LogLevel.INFO)) {
      await this.writeLog(LogLevel.INFO, message, context);
    }
  }
  
  async debug(message: string, context?: any): Promise<void> {
    if (this.shouldLog(LogLevel.DEBUG)) {
      await this.writeLog(LogLevel.DEBUG, message, context);
    }
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }
  
  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): ContextLogger {
    return new ContextLogger(this, context);
  }
}

/**
 * Context logger that adds additional context to all log messages
 */
export class ContextLogger {
  constructor(
    private parent: Logger,
    private context: Record<string, any>
  ) {}
  
  async error(message: string, error?: Error | any, additionalContext?: any): Promise<void> {
    await this.parent.error(message, error, { ...this.context, ...additionalContext });
  }
  
  async warn(message: string, additionalContext?: any): Promise<void> {
    await this.parent.warn(message, { ...this.context, ...additionalContext });
  }
  
  async info(message: string, additionalContext?: any): Promise<void> {
    await this.parent.info(message, { ...this.context, ...additionalContext });
  }
  
  async debug(message: string, additionalContext?: any): Promise<void> {
    await this.parent.debug(message, { ...this.context, ...additionalContext });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

/**
 * Wrap a function with error logging
 */
export function withErrorLogging<T extends (...args: any[]) => any>(
  fn: T,
  context: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      await logger.error(`Error in ${context}:`, error, { args });
      throw error;
    }
  }) as T;
}

/**
 * Safe error handler that logs but doesn't throw
 */
export async function safeErrorHandler(
  operation: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    await logger.error(`Failed operation: ${operation}`, error);
    // Don't re-throw, just log
  }
}