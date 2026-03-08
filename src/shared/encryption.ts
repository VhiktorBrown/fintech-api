import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

//algorithm and key size for AES-256-CBC.
//the key must be exactly 32 bytes — store it as a 64-char hex string in .env
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; //AES block size is always 16 bytes

/**
 * Encrypts a plain-text string using AES-256-CBC.
 *
 * A random IV is generated for every call so that encrypting the same
 * value twice produces different ciphertext, preventing pattern analysis.
 * The IV is prepended to the ciphertext (hex:hex) so it can be recovered
 * during decryption without storing it separately.
 *
 * Usage:
 *   const encrypted = encrypt('123456789012', process.env.ENCRYPTION_KEY);
 */
export function encrypt(plainText: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

    //store as "iv:ciphertext" so decrypt() can retrieve the IV without any extra DB columns
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value that was previously encrypted with encrypt().
 *
 * Usage:
 *   const bvn = decrypt(user.bvn, process.env.ENCRYPTION_KEY);
 */
export function decrypt(encryptedText: string, keyHex: string): string {
    const [ivHex, cipherHex] = encryptedText.split(':');
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherHex, 'hex')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}
