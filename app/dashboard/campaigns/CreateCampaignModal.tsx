"use client";

import { useState } from "react";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle, Sparkles, Target, Zap, MessageSquare } from "lucide-react";

export default function CreateCampaignModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  initialData = null,
  editingId = null 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSuccess: () => void,
  initialData?: any,
  editingId?: string | null
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  
  const [generatedUserQuestions, setGeneratedUserQuestions] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});

  const [formData, setFormData] = useState(initialData || {
    name: "",
    goal: "Book discovery calls",
    targetAudience: "",
    industry: "",
    offer: "",
    tone: "Professional",
    painPoints: "",
    senderName: "",
    sendingMode: "Human Approval Mode",
    aiAnalysis: null,
  });

  if (!isOpen) return null;

  const totalSteps = 6;

  const handleNext = () => setStep(prev => Math.min(prev + 1, totalSteps));
  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleAnswerChange = (index: number, value: string) => {
    setUserAnswers(prev => ({ ...prev, [index]: value }));
  };

  const handleGenerateQuestions = async () => {
    if (!formData.targetAudience || !formData.industry || !formData.offer) {
      alert("Please fill in Target Audience, Industry, and Offer first.");
      return;
    }

    setAiGenerating(true);
    setStep(2); // Move to loading step
    try {
      const res = await fetch("/api/campaigns/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAudience: formData.targetAudience,
          industry: formData.industry,
          offer: formData.offer,
          goal: formData.goal
        }),
      });
      
      const data = await res.json();
      if (res.ok && data.questions) {
        setGeneratedUserQuestions(data.questions);
        setUserAnswers({});
        setStep(3); // Move to Q&A step
      } else {
        alert(data.error || "Failed to generate questions.");
        setStep(1);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
      setStep(1);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleGenerateStrategy = async () => {
    // Check if all questions are answered
    for (let i = 0; i < generatedUserQuestions.length; i++) {
      if (!userAnswers[i] || userAnswers[i].trim() === '') {
        alert("Please answer all the questions so the AI can build an accurate strategy.");
        return;
      }
    }

    const formattedAnswers = generatedUserQuestions.map((q, i) => ({
      question: q,
      answer: userAnswers[i]
    }));

    setAiGenerating(true);
    setStep(4); // Move to strategy loading step
    try {
      const res = await fetch("/api/campaigns/strategy-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAudience: formData.targetAudience,
          industry: formData.industry,
          offer: formData.offer,
          goal: formData.goal,
          answers: formattedAnswers
        }),
      });
      
      const data = await res.json();
      if (res.ok && data.strategy) {
        const s = data.strategy;
        setFormData((prev: any) => ({
          ...prev,
          name: s.campaignTitle,
          tone: s.recommendedEmailTone,
          painPoints: Array.isArray(s.expectedPainPoints) ? s.expectedPainPoints.join(', ') : s.expectedPainPoints,
          aiAnalysis: {
            generatedQuestions: s.generatedQuestions, // Discovery questions for prospect
            messagingAngle: s.messagingAngle,
            userQnA: formattedAnswers
          }
        }));
        setStep(5); // Move to strategy review step
      } else {
        alert(data.error || "Failed to generate strategy.");
        setStep(3);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
      setStep(3);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingId ? `/api/campaigns/${editingId}` : "/api/campaigns";
      const method = editingId ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        alert(data.error || "Failed to save campaign.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-2xl">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="text-blue-400" size={24} />
              {editingId ? "Edit Campaign" : "AI Campaign Strategy Builder"}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Step {step} of {totalSteps} • {
                step === 1 ? "Core Inputs" : 
                step === 2 ? "Generating Questions" : 
                step === 3 ? "Deep Context Q&A" : 
                step === 4 ? "Building Strategy" :
                step === 5 ? "Review Strategy" : 
                "Final Config"
              }
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
          <form id="campaign-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* STEP 1: CORE INPUTS */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-6">
                  <p className="text-blue-300 text-sm flex items-center gap-2">
                    <Target size={16} />
                    Tell the AI about your target market. It will automatically generate contextual discovery questions for you to answer.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Target Audience *</label>
                  <input required type="text" value={formData.targetAudience} onChange={e => handleChange("targetAudience", e.target.value)} placeholder="e.g. B2B SaaS Founders, Recruiters, Coaches" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Industry *</label>
                  <input required type="text" value={formData.industry} onChange={e => handleChange("industry", e.target.value)} placeholder="e.g. Technology, Healthcare, Real Estate" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Core Offer / Service *</label>
                  <textarea required rows={3} value={formData.offer} onChange={e => handleChange("offer", e.target.value)} placeholder="e.g. We place elite Senior Engineers in 14 days" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Campaign Goal</label>
                  <select value={formData.goal} onChange={e => handleChange("goal", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all">
                    <option value="Book discovery calls">Book discovery calls</option>
                    <option value="Get demo requests">Get demo requests</option>
                    <option value="Lead generation / Email replies">Lead generation / Email replies</option>
                  </select>
                </div>

              </div>
            )}

            {/* STEP 2: AI GENERATING QUESTIONS */}
            {step === 2 && (
              <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-purple-500/30 rounded-full animate-ping absolute inset-0"></div>
                  <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(147,51,234,0.5)]">
                    <MessageSquare className="text-white animate-pulse" size={32} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mt-8 mb-2">Analyzing your business context...</h3>
                <p className="text-slate-400 text-center max-w-md">
                  The AI is generating specific questions about your {formData.industry} offer to extract the best angles for this campaign.
                </p>
              </div>
            )}

            {/* STEP 3: DEEP CONTEXT Q&A */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl mb-4">
                  <p className="text-purple-300 text-sm flex items-center gap-2 font-medium">
                    <MessageSquare size={16} />
                    Please answer the following questions. The AI will use your answers to craft a hyper-personalized email strategy.
                  </p>
                </div>

                <div className="space-y-5">
                  {generatedUserQuestions.map((question, idx) => (
                    <div key={idx} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                      <label className="block text-sm font-semibold text-white mb-2">{idx + 1}. {question}</label>
                      <textarea 
                        rows={3} 
                        value={userAnswers[idx] || ''} 
                        onChange={e => handleAnswerChange(idx, e.target.value)} 
                        placeholder="Your answer..." 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all resize-none" 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 4: AI GENERATION LOADING */}
            {step === 4 && (
              <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full animate-ping absolute inset-0"></div>
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(37,99,235,0.5)]">
                    <Sparkles className="text-white animate-pulse" size={32} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mt-8 mb-2">AI is building your strategy</h3>
                <p className="text-slate-400 text-center max-w-md">
                  Analyzing your answers... Generating contextual discovery questions and mapping conversion triggers.
                </p>
              </div>
            )}

            {/* STEP 5: REVIEW STRATEGY */}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 p-6 rounded-xl">
                  <h4 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-400" />
                    Strategy Generated Successfully
                  </h4>
                  <p className="text-blue-200/70 text-sm">Review the AI-generated strategy below based on your answers.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Generated Campaign Title</label>
                  <input type="text" value={formData.name} onChange={e => handleChange("name", e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3 text-white font-semibold text-lg" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
                    <h5 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Zap size={16} className="text-yellow-400" />
                      Prospect Discovery Questions
                    </h5>
                    <ul className="space-y-3">
                      {formData.aiAnalysis?.generatedQuestions?.map((q: string, i: number) => (
                        <li key={i} className="text-slate-200 text-sm flex items-start gap-2 bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
                          <span className="text-blue-400 font-bold">{i+1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-500 mt-4 italic">These questions will be dynamically injected into your email follow-ups to hook prospects.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Messaging Angle</h5>
                      <p className="text-slate-300 text-sm leading-relaxed">{formData.aiAnalysis?.messagingAngle}</p>
                    </div>

                    <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Expected Pain Points</h5>
                      <textarea rows={3} value={formData.painPoints} onChange={e => handleChange("painPoints", e.target.value)} className="w-full bg-transparent border-none p-0 text-sm text-slate-300 focus:ring-0 resize-none" />
                    </div>

                    <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Recommended Tone</h5>
                      <input type="text" value={formData.tone} onChange={e => handleChange("tone", e.target.value)} className="w-full bg-slate-700/50 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: FINAL CONFIG */}
            {step === 6 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">Final Configuration</h4>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Sender Name</label>
                  <input type="text" value={formData.senderName} onChange={e => handleChange("senderName", e.target.value)} placeholder="e.g. John Doe" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Sending Mode</label>
                  <select value={formData.sendingMode} onChange={e => handleChange("sendingMode", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Human Approval Mode">Human Approval Mode (Draft First)</option>
                    <option value="Fully Autonomous">Fully Autonomous (Auto-send)</option>
                  </select>
                </div>
              </div>
            )}

          </form>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-between bg-slate-900 rounded-b-2xl items-center">
          <button 
            type="button" 
            onClick={handleBack} 
            disabled={step === 1 || aiGenerating || step === 2 || step === 4}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg font-medium transition-all flex items-center space-x-2 border border-slate-700"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          
          <div className="flex gap-3">
            {step === 1 ? (
              <button 
                type="button" 
                onClick={handleGenerateQuestions}
                disabled={aiGenerating}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-bold transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(147,51,234,0.5)] flex items-center space-x-2"
              >
                <MessageSquare size={18} />
                <span>Ask Me Questions</span>
              </button>
            ) : step === 3 ? (
              <button 
                type="button" 
                onClick={handleGenerateStrategy}
                disabled={aiGenerating}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] flex items-center space-x-2"
              >
                <Sparkles size={18} />
                <span>Build Strategy</span>
              </button>
            ) : step === 5 ? (
              <button 
                type="button" 
                onClick={handleNext}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            ) : step === 6 ? (
              <button 
                type="submit" 
                form="campaign-form"
                disabled={loading || !formData.name}
                className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center space-x-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                <span>{editingId ? "Save Changes" : "Create Campaign"}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
