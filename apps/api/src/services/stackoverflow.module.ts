import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StackOverflowApiService } from './stackoverflow-api.service';

@Module({
  imports: [ConfigModule],
  providers: [StackOverflowApiService],
  exports: [StackOverflowApiService],
})
export class StackOverflowModule {}
