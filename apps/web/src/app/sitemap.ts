import { MetadataRoute } from 'next';
import { SitemapGenerator } from '@/lib/sitemap';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return await SitemapGenerator.generateFullSitemap();
}