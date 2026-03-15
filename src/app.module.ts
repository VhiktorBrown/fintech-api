import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TransactionModule } from './transaction/transaction.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { WalletModule } from './wallet/wallet.module';
import { PaystackModule } from './paystack/paystack.module';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),

    //rate limiter applied globally to every route.
    //these values allow 20 requests per minute per IP by default.
    //auth endpoints (login, register) are the most important to protect
    //against brute-force — tighten these values in production if needed
    ThrottlerModule.forRoot([{
      ttl: 60_000, //window size in milliseconds (60 seconds)
      limit: 20,   //max requests per IP within the window
    }]),

    AuthModule,
    WalletModule,
    PaystackModule,
    WebhookModule,
    InboxModule,
    UserModule,
    TransactionModule,
    PrismaModule,
  ],
  providers: [
    //registers ThrottlerGuard globally so every route is rate-limited
    //without needing to apply @UseGuards(ThrottlerGuard) on each controller
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
