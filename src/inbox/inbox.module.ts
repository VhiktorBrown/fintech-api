import { Module } from '@nestjs/common';
import { InboxProcessor } from './inbox.processor';

@Module({
    providers: [InboxProcessor],
})
export class InboxModule {}
