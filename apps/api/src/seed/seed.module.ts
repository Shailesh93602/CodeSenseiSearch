import { Module } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  controllers: [SeedController],
  providers: [SeedService, PrismaService, GeminiService],
})
export class SeedModule {}
