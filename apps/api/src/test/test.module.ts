import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { GitHubModule } from '../services/github.module';
import { StackOverflowModule } from '../services/stackoverflow.module';
import { QueueService } from '../services/queue.service';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { SearchService } from '../services/search.service';

@Module({
  imports: [GitHubModule, StackOverflowModule],
  controllers: [TestController],
  providers: [
    QueueService,
    PrismaService,
    GeminiService,
    VectorService,
    SearchService,
  ],
})
export class TestModule {}
