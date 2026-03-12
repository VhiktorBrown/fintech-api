import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PaystackModule } from 'src/paystack/paystack.module';

@Module({
    imports: [PaystackModule],
    controllers: [WebhookController],
    providers: [WebhookService],
})
export class WebhookModule {}
