import { ConsoleLogger, LogLevel } from '@nestjs/common';

type JsonLogPayload = {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  stack?: string;
  details?: unknown;
};

export class JsonLogger extends ConsoleLogger {
  constructor(context?: string, options?: { logLevels?: LogLevel[] }) {
    super(context || 'App', options || {});
  }

  override log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  override warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const payload = this.toPayload(level, message, context, stack);
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  private toPayload(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): JsonLogPayload {
    if (typeof message === 'string') {
      return {
        timestamp: new Date().toISOString(),
        level,
        context: context || this.context,
        message,
        stack,
      };
    }

    if (message instanceof Error) {
      return {
        timestamp: new Date().toISOString(),
        level,
        context: context || this.context,
        message: message.message,
        stack: message.stack || stack,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context,
      message: 'non-string-log',
      stack,
      details: message,
    };
  }
}
