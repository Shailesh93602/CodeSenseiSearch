import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { CTA } from "@/components/cta";
import { SearchActionStructuredData } from "@/components/seo/StructuredData";

export default function Home() {
  return (
    <>
      <SearchActionStructuredData searchUrl="https://code-sensei-search-web.vercel.app/search" />
      <main className="min-h-screen">
        <Hero />
        <Features />
        <CTA />
      </main>
    </>
  );
}
