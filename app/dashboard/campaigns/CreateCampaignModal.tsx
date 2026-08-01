"use client";

import { useState } from "react";
import { Loader2, CheckCircle, Sparkles } from "lucide-react";

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
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState(initialData || {
    name: "",
    goal: "Book discovery calls",
    targetAudience: "",
    industry: "",
    offer: "",
    senderName: "",
    emailSequenceCount: 4,
  });

  if (!isOpen) return null;

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
        body: JSON.stringify({
          ...formData,
          emailSequenceCount: parseInt(String(formData.emailSequenceCount)) || 4,
        }),
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
      <div className="glass bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-2xl">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="text-blue-400" size={24} />
              {editingId ? "Edit Campaign" : "Create Campaign"}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Describe your offer — AI writes a unique email sequence for every lead automatically.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
          <form id="campaign-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Campaign Name *</label>
              <input required type="text" value={formData.name} onChange={e => handleChange("name", e.target.value)} placeholder="e.g. Texas Restaurants Outreach" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Core Offer / Service *</label>
              <textarea required rows={3} value={formData.offer} onChange={e => handleChange("offer", e.target.value)} placeholder="e.g. We place elite Senior Engineers in 14 days" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Target Audience</label>
                <input type="text" value={formData.targetAudience} onChange={e => handleChange("targetAudience", e.target.value)} placeholder="e.g. Restaurant Owners" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Industry</label>
                <input type="text" value={formData.industry} onChange={e => handleChange("industry", e.target.value)} placeholder="e.g. Restaurants" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Number of Emails per Sequence *</label>
                <select value={formData.emailSequenceCount || 4} onChange={e => handleChange("emailSequenceCount", parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all">
                  <option value={3}>3 emails</option>
                  <option value={4}>4 emails (recommended)</option>
                  <option value={5}>5 emails</option>
                  <option value={6}>6 emails</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">AI generates this many emails per lead, spaced out automatically.</p>
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

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Sender Name</label>
              <input type="text" value={formData.senderName} onChange={e => handleChange("senderName", e.target.value)} placeholder="e.g. John Doe" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end bg-slate-900 rounded-b-2xl items-center gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all border border-slate-700">
            Cancel
          </button>
          <button
            type="submit"
            form="campaign-form"
            disabled={loading}
            className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center space-x-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            <span>{editingId ? "Save Changes" : "Create Campaign"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
