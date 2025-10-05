import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from '../services/search.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { PrismaService } from '../services/prisma.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, GeminiService, VectorService, PrismaService],
  exports: [SearchService, GeminiService, VectorService],
})
export class SearchModule {}
