import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaService } from '../services/prisma.service';
import { QueueService } from '../services/queue.service';

@Module({
  controllers: [AdminController],
  providers: [PrismaService, QueueService],
})
export class AdminModule {}
