"use client";
import React from 'react';
import { Users, Sparkles, ArrowRight, Zap, Target, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PersonLeadsComingSoonPage() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] p-6">
      {/* Background Glows */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Main Card */}
      <div className="relative w-full max-w-3xl bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-12 text-center overflow-hidden">
        
        {/* Top Floating Icons */}
        <div className="flex justify-center items-center space-x-6 mb-8 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
            <Users className="text-purple-400" size={32} />
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center border border-slate-700">
            <Search className="text-slate-400" size={24} />
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center border border-slate-700">
            <Target className="text-slate-400" size={24} />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Sparkles size={16} />
            <span>Coming Soon</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-400 mb-6">
            Next-Gen Person Leads
          </h1>
          
          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            We are completely rebuilding the Person Leads engine to bring you deeper insights, higher accuracy, and instant verification for every professional contact you scrape.
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-12 text-left">
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 flex items-start space-x-4">
              <Zap className="text-yellow-400 shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">Instant Enrichment</h3>
                <p className="text-sm text-slate-500">Find real-time verified emails and direct phone numbers instantly.</p>
              </div>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 flex items-start space-x-4">
              <Target className="text-blue-400 shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">Hyper-Targeting</h3>
                <p className="text-sm text-slate-500">Filter by granular roles, specific industries, and company size.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => router.push('/dashboard/leads')}
            className="group relative inline-flex items-center justify-center space-x-2 bg-slate-100 text-slate-900 px-8 py-4 rounded-xl font-semibold hover:bg-white transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-lg shadow-white/10"
          >
            <span>Use Business Leads Meanwhile</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        
        {/* Decorative Grid Background inside card */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
      </div>
    </div>
  );
}
