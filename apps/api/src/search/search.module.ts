import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from '../services/search.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { PrismaService } from '../services/prisma.service';
import { FullTextSearchService } from './services/fulltext-search.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { SearchRerankerService } from './services/search-reranker.service';
import { SearchFilterService } from './services/search-filter.service';

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    GeminiService,
    VectorService,
    PrismaService,
    FullTextSearchService,
    HybridSearchService,
    SearchRerankerService,
    SearchFilterService,
  ],
  exports: [
    SearchService,
    GeminiService,
    VectorService,
    FullTextSearchService,
    HybridSearchService,
    SearchRerankerService,
    SearchFilterService,
  ],
})
export class SearchModule {}
