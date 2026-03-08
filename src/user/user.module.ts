import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AccountModule } from 'src/account/account.module';

@Module({
    //AccountModule is imported so UserService can inject AccountService
    //to create a bank account when a user sets their transaction PIN
    imports: [AccountModule],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
