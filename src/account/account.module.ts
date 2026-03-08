import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  controllers: [AccountController],
  providers: [AccountService],
  //exported so UserModule can inject AccountService to create accounts
  //after a user sets their transaction PIN
  exports: [AccountService],
})
export class AccountModule {}
