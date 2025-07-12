import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Mail } from "lucide-react";

export function CTA() {
  return (
    <section className="py-24 bg-slate-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to supercharge your development workflow?
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Join thousands of developers who are already finding code faster with AI-powered search.
            Get early access and be among the first to experience the future of developer search.
          </p>

          {/* Email Signup */}
          <div className="mt-10">
            <div className="flex max-w-md mx-auto gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className="h-12 pl-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/20 focus:border-blue-400"
                />
              </div>
              <Button size="lg" className="h-12 px-6 bg-blue-600 hover:bg-blue-700">
                Get Early Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              No spam. Unsubscribe at any time.
            </p>
          </div>

          {/* Social Proof */}
          <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">1000+</div>
              <div className="text-sm text-slate-400">Developers waiting</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">24/7</div>
              <div className="text-sm text-slate-400">Search availability</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">99.9%</div>
              <div className="text-sm text-slate-400">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">Free</div>
              <div className="text-sm text-slate-400">For developers</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}