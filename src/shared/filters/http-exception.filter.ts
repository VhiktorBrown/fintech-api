import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * HttpExceptionFilter
 *
 * A global exception filter that intercepts every HttpException thrown
 * anywhere in the app (ForbiddenException, BadRequestException, etc.)
 * and formats the error response into a single consistent shape:
 *
 *   { success: false, statusCode: 403, message: "..." }
 *
 * This means:
 *   - You only need to throw — never return — exceptions in services/controllers.
 *   - Error and success responses always look the same to API consumers.
 *
 * Registered globally in main.ts via app.useGlobalFilters().
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const status = exception.getStatus();

        const exceptionResponse = exception.getResponse();

        // If AppResponse.error() was used, the body is already fully formatted
        // with { success: false, statusCode, message } — send it as-is.
        if (typeof exceptionResponse === 'object' && 'success' in exceptionResponse) {
            return response.status(status).json(exceptionResponse);
        }

        // For exceptions thrown directly (e.g. throw new ForbiddenException('...')),
        // NestJS provides either a plain string or an object like { message: [...] }.
        // We normalise both into our standard shape here.
        const message =
            typeof exceptionResponse === 'string'
                ? exceptionResponse
                : (exceptionResponse as any).message ?? 'An unexpected error occurred';

        response.status(status).json({
            success: false,
            statusCode: status,
            message,
        });
    }
}
