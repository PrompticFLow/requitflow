"use client";

import { useState } from "react";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";

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
  const [formData, setFormData] = useState(initialData || {
    name: "",
    goal: "Book discovery calls",
    campaignType: "Cold outreach",
    targetAudience: "",
    targetIndustry: "",
    targetCompanyType: "",
    targetRoles: "",
    targetMarket: "",
    location: "",
    offer: "",
    mainBenefit: "",
    uniqueMechanism: "",
    proofCaseStudy: "",
    painPoints: "",
    desiredOutcome: "",
    objections: "",
    problemSolved: "",
    avoidSaying: "",
    personalizationStyle: "First Name + Company Name",
    mentionCompanyName: true,
    companyFallback: "your team",
    useKnowledgeBase: true,
    bookingMethod: "Booking link",
    bookingLinkStrategy: "Soft CTA first, link later",
    ctaText: "Are you open to a quick chat?",
    ctaType: "Book Discovery Call",
    bookingLink: "",
    senderName: "",
    sendingMode: "Human Approval Mode",
    senderEmail: "",
    tone: "Professional",
    language: "English",
    followUpStyle: "Value-based (Case studies & Proof)"
  });

  if (!isOpen) return null;

  const totalSteps = 9;

  const handleNext = () => setStep(prev => Math.min(prev + 1, totalSteps));
  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
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
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-white">
              {editingId ? "Edit Campaign" : "Create AI Campaign"}
            </h3>
            <p className="text-slate-400 text-sm mt-1">Step {step} of {totalSteps}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="campaign-form" onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">1. Campaign Basics</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Campaign Name *</label>
                  <input required type="text" value={formData.name} onChange={e => handleChange("name", e.target.value)} placeholder="e.g. Q3 Executive Search" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Campaign Goal</label>
                  <input type="text" value={formData.goal} onChange={e => handleChange("goal", e.target.value)} placeholder="e.g. Book discovery calls with CTOs" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Campaign Type</label>
                  <select value={formData.campaignType} onChange={e => handleChange("campaignType", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Cold outreach">Cold Outreach</option>
                    <option value="Warm follow-up">Warm Follow-up</option>
                    <option value="Inbound lead nurture">Inbound Nurture</option>
                    <option value="Event follow-up">Event Follow-up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Follow-up Style</label>
                  <select value={formData.followUpStyle} onChange={e => handleChange("followUpStyle", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Value-based (Case studies & Proof)">Value-based (Case studies & Proof)</option>
                    <option value="Aggressive (Direct & Urgent)">Aggressive (Direct & Urgent)</option>
                    <option value="Soft & Consultative">Soft & Consultative</option>
                    <option value="Objection-handling focused">Objection-handling focused</option>
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">2. Target Audience</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Target Roles</label>
                  <input type="text" value={formData.targetRoles} onChange={e => handleChange("targetRoles", e.target.value)} placeholder="e.g. CTO, VP of Engineering" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Target Industry</label>
                  <input type="text" value={formData.targetIndustry} onChange={e => handleChange("targetIndustry", e.target.value)} placeholder="e.g. B2B SaaS, FinTech" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Company Type/Size</label>
                  <input type="text" value={formData.targetCompanyType} onChange={e => handleChange("targetCompanyType", e.target.value)} placeholder="e.g. Series A-C, 50-200 employees" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Location</label>
                  <input type="text" value={formData.location} onChange={e => handleChange("location", e.target.value)} placeholder="e.g. United States, London, Global" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">3. Offer Details</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">What is your core offer?</label>
                  <textarea rows={3} value={formData.offer} onChange={e => handleChange("offer", e.target.value)} placeholder="e.g. We place elite Senior Engineers in 14 days" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Main Benefit</label>
                  <input type="text" value={formData.mainBenefit} onChange={e => handleChange("mainBenefit", e.target.value)} placeholder="e.g. Reduce hiring time by 50%" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Unique Mechanism (How do you do it?)</label>
                  <input type="text" value={formData.uniqueMechanism} onChange={e => handleChange("uniqueMechanism", e.target.value)} placeholder="e.g. AI-driven talent matching" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Proof / Case Study (Optional)</label>
                  <textarea rows={2} value={formData.proofCaseStudy} onChange={e => handleChange("proofCaseStudy", e.target.value)} placeholder="e.g. We helped Stripe hire 20 engineers last quarter" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">4. Pain Points & Desired Outcome</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Current Pain Points</label>
                  <textarea rows={2} value={formData.painPoints} onChange={e => handleChange("painPoints", e.target.value)} placeholder="e.g. Wasting time on unqualified candidates" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Desired Outcome</label>
                  <textarea rows={2} value={formData.desiredOutcome} onChange={e => handleChange("desiredOutcome", e.target.value)} placeholder="e.g. Build a high-performing engineering team quickly" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Common Objections</label>
                  <input type="text" value={formData.objections} onChange={e => handleChange("objections", e.target.value)} placeholder="e.g. We already use an agency" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Words to Avoid</label>
                  <input type="text" value={formData.avoidSaying} onChange={e => handleChange("avoidSaying", e.target.value)} placeholder="e.g. 'Synergy', 'Guaranteed'" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">5. Personalization Rules</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Personalization Style</label>
                  <select value={formData.personalizationStyle} onChange={e => handleChange("personalizationStyle", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="First Name + Company Name">First Name + Company Name</option>
                    <option value="Casual (First Name only)">Casual (First Name only)</option>
                    <option value="Deep (Role, Industry, Insights)">Deep (Role, Industry, Insights)</option>
                  </select>
                </div>
                <div className="flex items-center space-x-3 bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <input type="checkbox" checked={formData.mentionCompanyName} onChange={e => handleChange("mentionCompanyName", e.target.checked)} className="w-5 h-5 bg-slate-700 border-slate-600 rounded" />
                  <div className="flex-1">
                    <label className="text-sm font-medium text-white">Mention Company Name</label>
                    <p className="text-xs text-slate-400">AI will safely embed the lead's company name.</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Company Fallback (if company missing)</label>
                  <input type="text" value={formData.companyFallback} onChange={e => handleChange("companyFallback", e.target.value)} placeholder="e.g. your team, your business" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Tone</label>
                  <select value={formData.tone} onChange={e => handleChange("tone", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Professional">Professional</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Direct">Direct & Concise</option>
                    <option value="Conversational">Conversational</option>
                  </select>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">6. Knowledge Base</h4>
                <div className="flex items-start space-x-3 bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <input type="checkbox" checked={formData.useKnowledgeBase} onChange={e => handleChange("useKnowledgeBase", e.target.checked)} className="w-5 h-5 bg-slate-700 border-slate-600 rounded mt-0.5" />
                  <div className="flex-1">
                    <label className="text-sm font-medium text-white block mb-1">Use Knowledge Base</label>
                    <p className="text-sm text-slate-400">
                      When enabled, AI will read your uploaded Knowledge Base files to generate hyper-accurate emails. It will strictly avoid inventing facts or pricing not found in the Knowledge Base.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">7. Call Booking Goal</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Booking Method</label>
                  <select value={formData.bookingMethod} onChange={e => handleChange("bookingMethod", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Booking link">Booking Link Only</option>
                    <option value="Google Calendar availability">Google Calendar Availability</option>
                    <option value="Both">Both</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Select "Google Calendar availability" if you have connected your calendar in Settings.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Booking Link URL (Optional if using Google Calendar)</label>
                  <input type="url" value={formData.bookingLink} onChange={e => handleChange("bookingLink", e.target.value)} placeholder="https://calendly.com/your-link" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Booking Link Strategy</label>
                  <select value={formData.bookingLinkStrategy} onChange={e => handleChange("bookingLinkStrategy", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
                    <option value="Soft CTA first, link later">Soft CTA first, link later</option>
                    <option value="Include link in every email">Include link in every email</option>
                    <option value="Link only when asked">Link only when asked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Call to Action (CTA) Text</label>
                  <input type="text" value={formData.ctaText} onChange={e => handleChange("ctaText", e.target.value)} placeholder="e.g. Are you open to a quick 10-minute chat?" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white" />
                </div>
              </div>
            )}

            {step === 8 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-4">8. Sending Settings</h4>
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

            {step === 9 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-xl font-semibold text-white mb-2">9. Review & Create</h4>
                <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="text-blue-400" size={24} />
                    </div>
                    <div>
                      <h5 className="font-bold text-white text-lg">{formData.name || 'Unnamed Campaign'}</h5>
                      <p className="text-sm text-slate-400">{formData.targetRoles} • {formData.targetIndustry}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500 block">Goal</span>
                      <span className="text-slate-200">{formData.goal || 'Not set'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Main Benefit</span>
                      <span className="text-slate-200">{formData.mainBenefit || 'Not set'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Booking Method</span>
                      <span className="text-slate-200">{formData.bookingMethod}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Sending Mode</span>
                      <span className="text-slate-200">{formData.sendingMode}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-between bg-slate-900/50 rounded-b-2xl">
          <button 
            type="button" 
            onClick={handleBack} 
            disabled={step === 1}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg font-medium transition-all flex items-center space-x-2"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          
          {step < totalSteps ? (
            <button 
              type="button" 
              onClick={handleNext}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center space-x-2"
            >
              <span>Next</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="submit" 
              form="campaign-form"
              disabled={loading || !formData.name}
              className="px-8 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-medium transition-all shadow-lg shadow-green-500/25 flex items-center space-x-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              <span>{editingId ? "Save Changes" : "Create Campaign"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
