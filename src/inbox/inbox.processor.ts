import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    InboxEventStatus,
    TransactionSource,
    TransactionStatus,
    TransactionType,
    VirtualAccountStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { generateTransactionReference } from 'src/shared/functions';

// maximum number of attempts before an event is permanently abandoned
const MAX_ATTEMPTS = 4;

// exponential backoff: delay = BASE_DELAY_S * (BACKOFF_MULTIPLIER ^ attempt)
// attempt 1 → 30s, attempt 2 → 120s, attempt 3 → 480s (~8 min), attempt 4 → permanent FAILED
const BASE_DELAY_S = 30;
const BACKOFF_MULTIPLIER = 4;
const JITTER_FACTOR = 0.2; // ±20% random jitter

@Injectable()
export class InboxProcessor {
    private readonly logger = new Logger(InboxProcessor.name);

    constructor(private prisma: PrismaService) {}

    // runs every 5 seconds — picks up one PENDING or retryable FAILED event at a time.
    // FOR UPDATE SKIP LOCKED ensures multiple app instances never claim the same row
    @Cron(CronExpression.EVERY_5_SECONDS)
    async process() {
        const event = await this.claimNextEvent();
        if (!event) return;

        this.logger.log(`Processing inbox event [${event.id}] type=${event.eventType} attempt=${event.attempts}`);

        try {
            await this.dispatch(event.eventType, event.payload as Record<string, any>);

            await this.prisma.inboxEvent.update({
                where: { id: event.id },
                data: {
                    status: InboxEventStatus.PROCESSED,
                    processedAt: new Date(),
                    errorMessage: null,
                },
            });

            this.logger.log(`Inbox event [${event.id}] processed successfully`);
        } catch (error) {
            const isPermanentFailure = event.attempts >= MAX_ATTEMPTS;

            await this.prisma.inboxEvent.update({
                where: { id: event.id },
                data: {
                    status: InboxEventStatus.FAILED,
                    errorMessage: error instanceof Error ? error.message : String(error),
                    nextRetryAt: isPermanentFailure ? null : this.calcNextRetryAt(event.attempts),
                },
            });

            if (isPermanentFailure) {
                this.logger.error(
                    `Inbox event [${event.id}] permanently failed after ${event.attempts} attempts: ${error.message}`,
                );
            } else {
                this.logger.warn(
                    `Inbox event [${event.id}] failed (attempt ${event.attempts}/${MAX_ATTEMPTS}), will retry: ${error.message}`,
                );
            }
        }
    }

    // atomically claims the next eligible event by setting it to PROCESSING.
    // FOR UPDATE SKIP LOCKED prevents concurrent workers from picking the same row
    private async claimNextEvent() {
        const results = await this.prisma.$queryRaw<{ id: number; eventType: string; payload: any; attempts: number }[]>`
            UPDATE inbox_events
            SET status = ${InboxEventStatus.PROCESSING}::"InboxEventStatus", attempts = attempts + 1, "updatedAt" = NOW()
            WHERE id = (
                SELECT id FROM inbox_events
                WHERE
                    (status = ${InboxEventStatus.PENDING}::"InboxEventStatus")
                    OR (
                        status = ${InboxEventStatus.FAILED}::"InboxEventStatus"
                        AND attempts < ${MAX_ATTEMPTS}
                        AND "nextRetryAt" IS NOT NULL
                        AND "nextRetryAt" <= NOW()
                    )
                ORDER BY "createdAt" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, "eventType", payload, attempts
        `;

        if (!results.length) return null;

        const row = results[0];
        return {
            id: row.id,
            eventType: row.eventType,
            payload: row.payload,
            attempts: row.attempts,
        };
    }

    private calcNextRetryAt(attempts: number): Date {
        const delaySecs = BASE_DELAY_S * Math.pow(BACKOFF_MULTIPLIER, attempts);
        const jitter = delaySecs * JITTER_FACTOR * (Math.random() * 2 - 1);
        return new Date(Date.now() + (delaySecs + jitter) * 1000);
    }

    private async dispatch(eventType: string, data: Record<string, any>) {
        switch (eventType) {
            case 'dedicatedaccount.assign.success':
                return this.handleDvaAssignSuccess(data);
            case 'dedicatedaccount.assign.failed':
                return this.handleDvaAssignFailed(data);
            case 'charge.success':
                if (data?.channel === 'dedicated_nuban') {
                    return this.handleIncomingTransfer(data);
                }
                return;
            case 'customeridentification.success':
            case 'customeridentification.failed':
                this.logger.log(`Customer identification event: ${eventType} for ${data?.email}`);
                return;
            default:
                this.logger.log(`No handler for event type: ${eventType}`);
        }
    }

    private async handleDvaAssignSuccess(data: Record<string, any>) {
        const email: string = data.customer?.email;
        const dva = data.dedicated_account;

        if (!email || !dva) {
            throw new Error('dedicatedaccount.assign.success missing email or dedicated_account');
        }

        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error(`No user found for email ${email}`);
        }

        await this.prisma.$transaction([
            this.prisma.virtualAccount.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    paystackCustomerCode: data.customer.customer_code,
                    accountNumber: dva.account_number,
                    accountName: dva.account_name,
                    bankName: dva.bank.name,
                    bankCode: dva.bank.slug,
                },
                update: {
                    paystackCustomerCode: data.customer.customer_code,
                    accountNumber: dva.account_number,
                    accountName: dva.account_name,
                    bankName: dva.bank.name,
                    bankCode: dva.bank.slug,
                },
            }),
            this.prisma.wallet.update({
                where: { userId: user.id },
                data: { virtualAccountStatus: VirtualAccountStatus.ACTIVE },
            }),
        ]);

        this.logger.log(`Virtual account activated for user ${user.id} (${email})`);
    }

    private async handleDvaAssignFailed(data: Record<string, any>) {
        const email: string = data.customer?.email;

        if (!email) {
            throw new Error('dedicatedaccount.assign.failed missing customer email');
        }

        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error(`No user found for email ${email}`);
        }

        await this.prisma.wallet.update({
            where: { userId: user.id },
            data: { virtualAccountStatus: VirtualAccountStatus.FAILED },
        });

        this.logger.warn(`Virtual account assignment failed for user ${user.id} (${email})`);
    }

    private async handleIncomingTransfer(data: Record<string, any>) {
        const paystackReference: string = data.reference;
        const accountNumber: string = data.metadata?.receiver_account_number;

        if (!paystackReference || !accountNumber) {
            throw new Error('charge.success missing reference or metadata.receiver_account_number');
        }

        // idempotency check — the inbox deduplicates events at the eventId level,
        // but this guards against the edge case where the same transfer is somehow
        // stored twice under different eventIds
        const alreadyProcessed = await this.prisma.transaction.findUnique({
            where: { paystackReference },
        });
        if (alreadyProcessed) {
            this.logger.log(`Transfer already credited, skipping: ${paystackReference}`);
            return;
        }

        const virtualAccount = await this.prisma.virtualAccount.findUnique({
            where: { accountNumber },
        });
        if (!virtualAccount) {
            throw new Error(`No virtual account found for account number ${accountNumber}`);
        }

        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: virtualAccount.userId },
        });
        if (!wallet || !wallet.isActive) {
            throw new Error(`Wallet missing or inactive for user ${virtualAccount.userId}`);
        }

        // Paystack sends amounts in kobo — convert to Naira before storing
        const amountNaira = data.amount / 100;
        const balanceBefore = Number(wallet.balance);
        const balanceAfter = balanceBefore + amountNaira;

        await this.prisma.$transaction([
            this.prisma.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: amountNaira } },
            }),
            this.prisma.transaction.create({
                data: {
                    type: TransactionType.CREDIT,
                    source: TransactionSource.PAYSTACK,
                    amount: amountNaira,
                    reference: generateTransactionReference(),
                    paystackReference,
                    status: TransactionStatus.SUCCESS,
                    description: `Bank transfer via ${data.metadata?.receiver_bank ?? virtualAccount.bankName}`,
                    walletId: wallet.id,
                    balanceBefore,
                    balanceAfter,
                },
            }),
        ]);

        this.logger.log(
            `Credited ₦${amountNaira} to wallet ${wallet.id} (user ${virtualAccount.userId}) — ref: ${paystackReference}`,
        );
    }
}
