"use client";
import { useState, useEffect } from "react";
import { Plus, Play, Pause, Square, MoreVertical, Loader2, Trash2, Edit2, Target } from "lucide-react";
import CreateCampaignModal from "./CreateCampaignModal";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [initialModalData, setInitialModalData] = useState<any>(null);

  const handleModalSuccess = () => {
    setShowModal(false);
    setInitialModalData(null);
    setEditingCampaignId(null);
    fetchCampaigns();
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setCampaigns(campaigns.map(c => c.id === id ? { ...c, status } : c));
      } else {
        alert("Failed to update campaign status.");
      }
    } catch (err) {
      alert("Error calling API");
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign? All associated emails and leads will be affected.")) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCampaigns(campaigns.filter(c => c.id !== id));
        setOpenDropdownId(null);
      } else {
        alert("Failed to delete campaign.");
      }
    } catch (err) {
      alert("Error calling API");
    }
  };

  const deleteAllCampaigns = async () => {
    if (!confirm("Are you absolutely sure you want to delete ALL campaigns? This action cannot be undone.")) return;
    
    // Double confirmation for safety
    if (!confirm("Confirm again: DELETE ALL CAMPAIGNS?")) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/campaigns/delete-all`, { method: "DELETE" });
      if (res.ok) {
        setCampaigns([]);
      } else {
        alert("Failed to delete all campaigns.");
      }
    } catch (err) {
      alert("Error calling API");
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.campaigns) {
        const mapped = data.campaigns.map((c: any) => ({
          id: c.id,
          name: c.name,
          goal: c.goal,
          target: c.targetAudience || "N/A",
          leads: c._count?.leads || 0,
          emailsSent: c._count?.emailSequences || 0,
          replies: c._count?.replies || 0,
          booked: c._count?.bookedCalls || 0,
          status: c.status
        }));
        setCampaigns(mapped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Campaigns</h2>
          <p className="text-slate-400">Manage your automated outreach campaigns for prospects and leads.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={deleteAllCampaigns}
            className="flex items-center space-x-2 px-4 py-2.5 bg-red-900/40 hover:bg-red-600/60 text-red-200 border border-red-500/30 hover:border-red-500/50 rounded-lg font-medium transition-all"
            title="Delete all campaigns"
          >
            <Trash2 size={18} />
            <span>Delete All</span>
          </button>
          <button 
            onClick={() => {
              setEditingCampaignId(null);
              setInitialModalData(null);
              setShowModal(true);
            }}
            className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25"
          >
            <Plus size={18} />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass p-12 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center text-center mt-6">
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
            <Target size={36} className="text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No campaigns created yet.</h3>
          <p className="text-slate-400 max-w-md mb-8">Create your first campaign to start automating your outreach.</p>
          <button 
            onClick={() => {
              setEditingCampaignId(null);
              setInitialModalData(null);
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((camp) => (
          <div key={camp.id} className="glass p-6 rounded-2xl border border-slate-700/50 flex flex-col relative group">
            <div 
              className="absolute top-6 right-6 text-slate-500 hover:text-white cursor-pointer transition z-10"
              onClick={() => setOpenDropdownId(openDropdownId === camp.id ? null : camp.id)}
            >
              <MoreVertical size={20} />
            </div>

            {openDropdownId === camp.id && (
              <div className="absolute top-12 right-6 w-40 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center space-x-2 transition-colors"
                  onClick={async () => {
                    // Fetch full campaign details for editing
                    const res = await fetch(`/api/campaigns/${camp.id}`);
                    const data = await res.json();
                    if (data.campaign) {
                      setInitialModalData(data.campaign);
                      setEditingCampaignId(camp.id);
                      setShowModal(true);
                      setOpenDropdownId(null);
                    }
                  }}
                >
                  <Edit2 size={14} />
                  <span>Edit Campaign</span>
                </button>
                <button 
                  onClick={() => deleteCampaign(camp.id)}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center space-x-2 transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </div>
            )}
            
            <div className="flex items-center space-x-3 mb-4">
              <span className={`w-3 h-3 rounded-full ${
                camp.status === 'Active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                camp.status === 'Draft' ? 'bg-slate-500' :
                'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]'
              }`}></span>
              <span className="text-sm font-medium text-slate-400 uppercase tracking-wide">{camp.status}</span>
            </div>

            <h3 className="text-xl font-bold text-white mb-1 truncate pr-8">{camp.name}</h3>
            <p className="text-sm text-slate-400 mb-6 truncate">{camp.goal}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-6 flex-1">
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Leads Enrolled</div>
                <div className="text-lg font-semibold text-white">{camp.leads}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Emails Sent</div>
                <div className="text-lg font-semibold text-white">{camp.emailsSent}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Replies</div>
                <div className="text-lg font-semibold text-white">{camp.replies}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Calls Booked</div>
                <div className="text-lg font-semibold text-green-400">{camp.booked}</div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              <button className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                View Analytics
              </button>
              <div className="flex space-x-2">
                {camp.status !== 'Active' && (
                  <button onClick={() => updateStatus(camp.id, 'Active')} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors border border-green-500/20" title="Start Campaign">
                    <Play size={18} />
                  </button>
                )}
                {camp.status === 'Active' && (
                  <button onClick={() => updateStatus(camp.id, 'Paused')} className="p-2 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors border border-yellow-500/20" title="Pause Campaign">
                    <Pause size={18} />
                  </button>
                )}
                <button onClick={() => updateStatus(camp.id, 'Stopped')} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20" title="Stop Campaign">
                  <Square size={18} />
                </button>
              </div>
            </div>
            </div>
          ))}
        </div>
      )}

      <CreateCampaignModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setInitialModalData(null);
          setEditingCampaignId(null);
        }}
        onSuccess={handleModalSuccess}
        initialData={initialModalData}
        editingId={editingCampaignId}
      />
    </div>
  );
}
