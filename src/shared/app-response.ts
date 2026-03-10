/**
 * AppResponse
 *
 * A utility class for building consistent API success responses.
 * Every successful response across the app should go through this
 * so the shape is always predictable:
 *
 *   { success: true, message: "...", ...data }
 *
 * Usage:
 *   return AppResponse.success('User found', { user });
 *   return AppResponse.success('Transfer successful');
 */
import {
    HttpStatus,
    HttpException,
} from '@nestjs/common';
export class AppResponse {
    static success(message: string, data: Record<string, unknown> = {}) {
        return {
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
     * unreachable, so you don't need to add a dummy return statement.
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
