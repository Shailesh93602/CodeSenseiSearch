import { SitemapGenerator } from '@/lib/sitemap';

export async function GET() {
  const xml = SitemapGenerator.generateSearchXml();
  
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}