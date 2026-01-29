/**
 * Structured Logger Module
 * Provides log-level controlled logging with structured output
 * Uses environment variables directly for test compatibility
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

function getLogLevel(): LogLevel {
  const level = process.env['LOG_LEVEL'] || 'info';
  return LOG_LEVELS[level as LogLevel] !== undefined ? (level as LogLevel) : 'info';
}

function getPrettyPrint(): boolean {
  const value = process.env['LOG_PRETTY_PRINT'];
  return value !== 'false';
}

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

class Logger {
  private level: number;
  private prettyPrint: boolean;
  private component?: string;

  constructor(component?: string) {
    this.level = LOG_LEVELS[getLogLevel()];
    this.prettyPrint = getPrettyPrint();
    this.component = component;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level;
  }

  private formatMessage(entry: LogEntry): string {
    if (this.prettyPrint) {
      const levelColors: Record<LogLevel, string> = {
        trace: '\x1b[90m',
        debug: '\x1b[36m',
        info: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        fatal: '\x1b[35m',
      };
      const reset = '\x1b[0m';
      const color = levelColors[entry.level];
      const component = this.component ? `[${this.component}] ` : '';
      const contextStr = entry.context
        ? ` ${JSON.stringify(entry.context)}`
        : '';
      return `${entry.timestamp} ${color}${entry.level.toUpperCase().padEnd(5)}${reset} ${component}${entry.message}${contextStr}`;
    }
    return JSON.stringify({
      ...entry,
      component: this.component,
    });
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    const formatted = this.formatMessage(entry);

    if (level === 'error' || level === 'fatal') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }

  child(component: string): Logger {
    const child = new Logger(
      this.component ? `${this.component}:${component}` : component
    );
    return child;
  }
}

export const logger = new Logger();

export function createLogger(component: string): Logger {
  return new Logger(component);
}
