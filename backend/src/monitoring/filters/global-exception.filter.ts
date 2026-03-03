import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SentryService } from '../sentry.service';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly sentryService: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const responseBody = this.resolveBody(exception, status);

    if (status >= 500) {
      this.sentryService.captureException(exception, {
        path: request.path,
        method: request.method,
        status,
        ip: request.ip,
      });
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(responseBody);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveBody(exception: unknown, status: number): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return {
          statusCode: status,
          message: payload,
        };
      }
      if (typeof payload === 'object' && payload !== null) {
        return payload as Record<string, unknown>;
      }
    }

    return {
      statusCode: status,
      message: 'Internal server error',
    };
  }
}
