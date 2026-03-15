import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaystackService } from 'src/paystack/paystack.service';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        private prisma: PrismaService,
        private paystackService: PaystackService,
    ) {}

    async handlePaystackWebhook(
        rawBody: Buffer,
        signature: string,
        body: Record<string, any>,
    ): Promise<void> {
        if (!this.paystackService.verifyWebhookSignature(rawBody, signature)) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        const eventType: string = body.event;
        const data = body.data;

        // derive a stable deduplication key from the event type and the most
        // specific unique identifier available in the payload
        const eventId = this.deriveEventId(eventType, data);

        this.logger.log(`Received Paystack webhook: ${eventType} (eventId: ${eventId})`);

        // persist the raw event immediately — return 200 to Paystack without processing.
        // the InboxProcessor picks it up asynchronously with retry + backoff
        try {
            await this.prisma.inboxEvent.create({
                data: { eventId, eventType, payload: body.data },
            });
        } catch (error) {
            // unique constraint violation means we already have this event — safe to ignore
            if (error?.code === 'P2002') {
                this.logger.warn(`Duplicate webhook ignored: ${eventId}`);
                return;
            }
            throw error;
        }
    }

    private deriveEventId(eventType: string, data: Record<string, any>): string {
        // charge events carry a unique reference per transaction
        if (data?.reference) {
            return `${eventType}:${data.reference}`;
        }

        // DVA and identification events are scoped to a customer
        if (data?.customer?.customer_code) {
            return `${eventType}:${data.customer.customer_code}`;
        }

        // customer_code is at the top level for identification events
        if (data?.customer_code) {
            return `${eventType}:${data.customer_code}`;
        }

        // fallback — should not happen for any of our handled event types
        this.logger.warn(`Could not derive a stable eventId for event type: ${eventType}`);
        return `${eventType}:${Date.now()}`;
    }
}
