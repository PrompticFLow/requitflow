"use client";
import { BookOpen, Clock } from "lucide-react";

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex items-center space-x-4 mb-2">
        <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
          <BookOpen className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Knowledge Base</h1>
          <p className="text-slate-400 text-sm mt-1">Train your AI agent with your business&apos;s unique value proposition.</p>
        </div>
      </div>

      <div className="glass p-12 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center text-center min-h-[50vh]">
        <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mb-6 border border-purple-500/20">
          <Clock size={36} className="text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Coming Soon</h2>
        <p className="text-slate-400 max-w-md">
          The Knowledge Base is being rebuilt. Upload documents and train your AI agent here soon.
        </p>
      </div>
    </div>
  );
}
