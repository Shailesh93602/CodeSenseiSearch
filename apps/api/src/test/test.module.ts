import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { GitHubModule } from '../services/github.module';
import { StackOverflowModule } from '../services/stackoverflow.module';
import { QueueService } from '../services/queue.service';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { SearchService } from '../services/search.service';
import { FullTextSearchService } from '../search/services/fulltext-search.service';
import { HybridSearchService } from '../search/services/hybrid-search.service';
import { SearchRerankerService } from '../search/services/search-reranker.service';
import { SearchFilterService } from '../search/services/search-filter.service';

@Module({
  imports: [GitHubModule, StackOverflowModule],
  controllers: [TestController],
  providers: [
    QueueService,
    PrismaService,
    GeminiService,
    VectorService,
    SearchService,
    FullTextSearchService,
    HybridSearchService,
    SearchRerankerService,
    SearchFilterService,
  ],
})
export class TestModule {}
