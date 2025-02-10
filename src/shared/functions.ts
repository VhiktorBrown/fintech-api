import { randomBytes } from 'crypto';

export function generateTransactionReference(prefix = 'TXN'): string {
    const timestamp = Date.now().toString(); // Current timestamp
    const randomString = randomBytes(4).toString('hex').toUpperCase(); // 8-char random string
    return `${prefix}-${timestamp}-${randomString}`;
}