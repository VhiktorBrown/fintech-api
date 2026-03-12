import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class PaystackService {
    private readonly secretKey: string;
    private readonly baseUrl: string;
    private readonly preferredBank: string;

    constructor(private config: ConfigService) {
        this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
        this.baseUrl = this.config.get<string>('PAYSTACK_BASE_URL');
        this.preferredBank = this.config.get<string>('PAYSTACK_PREFERRED_BANK');
    }

    // single Paystack endpoint that creates the customer and assigns a DVA in one shot.
    // the response is always "in progress" — the actual account details arrive via webhook
    async assignDedicatedAccount(data: {
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        bvn: string;
    }): Promise<void> {
        const response = await fetch(`${this.baseUrl}/dedicated_account/assign`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: data.email,
                first_name: data.firstName,
                last_name: data.lastName,
                phone: data.phone,
                bvn: data.bvn,
                preferred_bank: this.preferredBank,
                country: 'NG',
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new InternalServerErrorException(
                (error as any).message ?? 'Failed to initiate virtual account assignment',
            );
        }
    }

    // HMAC-SHA512 verification — rawBody must be the original Buffer before JSON parsing.
    // if we verify against the parsed/re-serialised body the hash will not match
    verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
        const hash = crypto
            .createHmac('sha512', this.secretKey)
            .update(rawBody)
            .digest('hex');
        return hash === signature;
    }
}
