import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { TransactionSource, TransactionStatus, TransactionType, VirtualAccountStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { generateTransactionReference } from 'src/shared/functions';

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
        // reject any request that cannot be verified as originating from Paystack
        if (!this.paystackService.verifyWebhookSignature(rawBody, signature)) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        const event: string = body.event;
        const data = body.data;

        this.logger.log(`Received Paystack webhook: ${event}`);

        switch (event) {
            case 'dedicatedaccount.assign.success':
                await this.handleDvaAssignSuccess(data);
                break;
            case 'dedicatedaccount.assign.failed':
                await this.handleDvaAssignFailed(data);
                break;
            case 'charge.success':
                if (data?.channel === 'dedicated_nuban') {
                    await this.handleIncomingTransfer(data);
                }
                break;
            case 'customeridentification.success':
            case 'customeridentification.failed':
                // informational events — BVN verification result before the DVA events fire
                this.logger.log(`Customer identification event: ${event} for ${data?.email}`);
                break;
            default:
                this.logger.log(`Unhandled Paystack event: ${event}`);
        }
    }

    // fires when Paystack successfully assigns a virtual account number to the customer.
    // we use the customer's email to find our user and create the VirtualAccount record
    private async handleDvaAssignSuccess(data: Record<string, any>) {
        const email: string = data.customer?.email;
        const dva = data.dedicated_account;

        if (!email || !dva) {
            this.logger.warn('dedicatedaccount.assign.success missing email or dedicated_account');
            return;
        }

        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            this.logger.warn(`DVA assign.success: no user found for email ${email}`);
            return;
        }

        // upsert so replayed webhooks are idempotent
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

    // fires when Paystack cannot assign a virtual account — typically a BVN mismatch.
    // we mark the wallet so the user sees an actionable status instead of hanging on PENDING
    private async handleDvaAssignFailed(data: Record<string, any>) {
        const email: string = data.customer?.email;

        if (!email) {
            this.logger.warn('dedicatedaccount.assign.failed missing customer email');
            return;
        }

        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            this.logger.warn(`DVA assign.failed: no user found for email ${email}`);
            return;
        }

        await this.prisma.wallet.update({
            where: { userId: user.id },
            data: { virtualAccountStatus: VirtualAccountStatus.FAILED },
        });

        this.logger.warn(`Virtual account assignment failed for user ${user.id} (${email})`);
    }

    // fires when money is transferred into a user's virtual account.
    // we credit the wallet and record the transaction atomically.
    // paystackReference @unique acts as the idempotency key — duplicate webhooks are ignored
    private async handleIncomingTransfer(data: Record<string, any>) {
        const paystackReference: string = data.reference;
        // the receiver's virtual account number lives in metadata, not dedicated_account
        const accountNumber: string = data.metadata?.receiver_account_number;

        if (!paystackReference || !accountNumber) {
            this.logger.warn('charge.success missing reference or metadata.receiver_account_number');
            return;
        }

        // idempotency check — Paystack retries failed webhooks; we must not double-credit
        const alreadyProcessed = await this.prisma.transaction.findUnique({
            where: { paystackReference },
        });
        if (alreadyProcessed) {
            this.logger.log(`Duplicate webhook ignored: ${paystackReference}`);
            return;
        }

        const virtualAccount = await this.prisma.virtualAccount.findUnique({
            where: { accountNumber },
        });
        if (!virtualAccount) {
            this.logger.warn(`charge.success: no virtual account found for ${accountNumber}`);
            return;
        }

        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: virtualAccount.userId },
        });
        if (!wallet || !wallet.isActive) {
            this.logger.warn(`charge.success: wallet missing or inactive for user ${virtualAccount.userId}`);
            return;
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
