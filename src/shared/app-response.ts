import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * AppResponse
 *
 * Single source of truth for all API responses — both success and error.
 * Using this everywhere guarantees every response has the same shape,
 * whether it's a 200 or a 403.
 *
 * Success shape:  { success: true,  message: "...", ...data }
 * Error shape:    { success: false, message: "...", statusCode: 403 }
 *
 * Usage:
 *   return AppResponse.success('User found', { user });
 *   AppResponse.error('Invalid PIN', HttpStatus.FORBIDDEN);
 */
export class AppResponse {
    static success(message: string, data: Record<string, unknown> = {}) {
        return {
            //data is spread first so that the caller can never accidentally
            //overwrite 'success' or 'message' by passing them inside data
            ...data,
            success: true,
            message,
        };
    }

    /**
     * Builds and throws an HttpException with success: false in the body.
     *
     * The return type is 'never' because this method always throws —
     * TypeScript uses this to know that any code after this call is
     * unreachable, so you don't need a dummy return statement after it.
     *
     * The thrown exception is caught by HttpExceptionFilter in main.ts,
     * which reads the pre-formatted body and sends it as-is.
     *
     * Usage:
     *   AppResponse.error('Insufficient balance', HttpStatus.FORBIDDEN);
     *   AppResponse.error('Validation failed', HttpStatus.BAD_REQUEST);
     */
    static error(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST): never {
        throw new HttpException(
            {
                success: false,
                statusCode: status,
                message,
            },
            status,
        );
    }
}
