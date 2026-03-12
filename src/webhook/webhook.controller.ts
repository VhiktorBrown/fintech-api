import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

@ApiTags('Webhooks')
@SkipThrottle()
@Controller('webhook')
export class WebhookController {
    constructor(private webhookService: WebhookService) {}

    @ApiOperation({ summary: 'Paystack webhook receiver — public endpoint, signature-verified' })
    @Post('paystack')
    @HttpCode(200)
    async handlePaystackWebhook(@Req() req: RawBodyRequest<Request>) {
        await this.webhookService.handlePaystackWebhook(
            req.rawBody,
            req.headers['x-paystack-signature'] as string,
            req.body,
        );
        return { received: true };
    }
}
