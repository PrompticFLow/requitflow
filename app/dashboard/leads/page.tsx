"use client";
import { useState, useEffect, useCallback } from "react";
import Link from 'next/link';
import { Search, Filter, Download, Plus, Trash2, Loader2, Users, X, ChevronDown, ShieldCheck, ShieldQuestion, MailX } from "lucide-react";

const EMAIL_STATUS_STYLES: Record<string, string> = {
  Valid: 'bg-green-500/20 text-green-400 border-green-500/30',
  Verified: 'bg-green-500/20 text-green-400 border-green-500/30',
  Invalid: 'bg-red-500/20 text-red-400 border-red-500/30',
  Disposable: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Catchall: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

function EmailStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const style = EMAIL_STATUS_STYLES[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  return (
    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide border ${style}`}>
      {status}
    </span>
  );
}

// NeverBounce verification state — distinct from the deliverability result above.
function VerificationBadge({ verifiedAt, hasEmail }: { verifiedAt: string | null; hasEmail: boolean }) {
  if (!hasEmail) {
    return <span className="text-slate-600 text-xs">—</span>;
  }
  if (verifiedAt) {
    const when = new Date(verifiedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return (
      <div className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-2px] shadow-emerald-500/40">
          <ShieldCheck size={11} className="shrink-0" />
          Verified
        </span>
        <span className="text-[9px] text-slate-500 pl-1">NeverBounce · {when}</span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-slate-600 bg-slate-800/40 text-slate-400">
      <ShieldQuestion size={11} className="shrink-0" />
      Not verified
    </span>
  );
}

export default function LeadDatabasePage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removingNoEmail, setRemovingNoEmail] = useState(false);

  // New states for campaigns
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [onlyVerifiedForCampaign, setOnlyVerifiedForCampaign] = useState(false);

  // Manual lead creation
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [newLeadData, setNewLeadData] = useState({
    businessName: '',
    email: '',
    phone: '',
    website: '',
    category: '',
    country: ''
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads");
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.leads) {
        setLeads(data.leads.map((l: any) => ({
          id: l.id,
          name: l.businessName,
          email: l.email || null,
          phone: l.phone || null,
          website: l.website || null,
          score: l.leadScore || 0,
          tier: l.leadTier || "Cold",
          status: l.status || "New",
          category: l.category || null,
          country: l.country || null,
          emailStatus: l.emailStatus || null,
          emailVerifiedAt: l.emailVerifiedAt || null,
          created: new Date(l.createdAt).toLocaleDateString()
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Filter leads
  useEffect(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.website || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q) ||
        (l.country || '').toLowerCase().includes(q)
      );
    }
    if (tierFilter !== 'All') result = result.filter(l => l.tier === tierFilter);
    if (statusFilter !== 'All') result = result.filter(l => l.status === statusFilter);
    setFiltered(result);
  }, [leads, search, tierFilter, statusFilter]);

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(l => l.id)));
    }
  };

  // Delete single lead
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead permanently?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      } else {
        alert('Delete failed. Please try again.');
      }
    } catch {
      alert('Delete failed. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!confirm(`⚠️ Permanently delete ${count} ${count === 1 ? 'lead' : 'leads'}?\n\nThis cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      // Delete all in parallel
      await Promise.all(ids.map(id => fetch(`/api/leads/${id}`, { method: 'DELETE' })));
      setLeads(prev => prev.filter(l => !selectedIds.has(l.id)));
      setSelectedIds(new Set());
    } catch {
      alert('Some deletes failed. Please refresh and try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Verify emails via NeverBounce
  const handleVerify = async () => {
    const scope = selectedIds.size > 0 ? filtered.filter(l => selectedIds.has(l.id)) : filtered;
    const withEmail = scope.filter(l => l.email);

    // Never verify the same email twice — skip anything already run through NeverBounce.
    const targets = withEmail.filter(l => !l.emailVerifiedAt);
    const alreadyVerified = withEmail.length - targets.length;

    if (targets.length === 0) {
      alert(
        withEmail.length === 0
          ? 'No leads with an email address to verify.'
          : 'All selected leads with an email have already been verified.'
      );
      return;
    }

    // Cost is per unique email — identical addresses are only checked once.
    const uniqueEmails = new Set(targets.map(l => l.email.toLowerCase())).size;
    const alreadyNote = alreadyVerified > 0 ? `\n${alreadyVerified} already verified (skipped).` : '';
    if (!confirm(`Verify ${targets.length} ${targets.length === 1 ? 'lead' : 'leads'}?\n\nUses ${uniqueEmails} NeverBounce ${uniqueEmails === 1 ? 'credit' : 'credits'}.${alreadyNote}`)) return;

    setVerifying(true);
    try {
      const res = await fetch('/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: targets.map(l => l.id) })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Verification failed.');
        return;
      }

      // Patch results in place so the badges update without a refetch.
      const byId = new Map<string, any>(data.results.map((r: any) => [r.id, r]));
      setLeads(prev => prev.map(l => (byId.has(l.id)
        ? { ...l, emailStatus: byId.get(l.id).status, emailVerifiedAt: byId.get(l.id).emailVerifiedAt }
        : l)));

      const breakdown = Object.entries(data.summary || {})
        .map(([status, count]) => `${status}: ${count}`)
        .join('\n');
      const errorNote = data.errors?.length ? `\n\n${data.errors.length} failed — ${data.errors[0]}` : '';
      alert(`Verified ${data.verified} ${data.verified === 1 ? 'lead' : 'leads'}\n\n${breakdown}${errorNote}`);
    } catch {
      alert('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Remove all leads that have no email address
  const handleRemoveNoEmail = async () => {
    const noEmail = leads.filter(l => !l.email);
    if (noEmail.length === 0) {
      alert('No leads without an email address to remove.');
      return;
    }
    if (!confirm(`⚠️ Permanently delete ${noEmail.length} ${noEmail.length === 1 ? 'lead' : 'leads'} with no email address?\n\nThis cannot be undone.`)) return;

    setRemovingNoEmail(true);
    try {
      const ids = noEmail.map(l => l.id);
      const results = await Promise.allSettled(ids.map(id => fetch(`/api/leads/${id}`, { method: 'DELETE' })));
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
      const deleted = new Set(ids);
      setLeads(prev => prev.filter(l => !deleted.has(l.id)));
      setSelectedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
      if (failed > 0) alert(`Removed ${ids.length - failed} of ${ids.length}. ${failed} failed — please refresh and retry.`);
    } catch {
      alert('Removal failed. Please try again.');
    } finally {
      setRemovingNoEmail(false);
    }
  };

  // Export CSV
  const handleExport = () => {
    const toExport = selectedIds.size > 0 ? filtered.filter(l => selectedIds.has(l.id)) : filtered;
    if (toExport.length === 0) return;
    const headers = "Business Name,Email,Phone,Website,Category,Score,Tier,Status,Country,Date Added\n";
    const rows = toExport.map(l =>
      `"${(l.name || '').replace(/"/g, '""')}","${l.email || ''}","${l.phone || ''}","${l.website || ''}","${l.category || ''}","${l.score}","${l.tier}","${l.status}","${l.country || ''}","${l.created}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Add to Campaign
  const handleOpenCampaignModal = () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one lead to add to a campaign.');
      return;
    }
    setIsCampaignModalOpen(true);
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaignId) return alert('Please select a campaign.');

    // Optionally restrict to leads NeverBounce has verified.
    let targetLeads = leads.filter(l => selectedIds.has(l.id));
    if (onlyVerifiedForCampaign) {
      targetLeads = targetLeads.filter(l => l.emailVerifiedAt);
      if (targetLeads.length === 0) {
        return alert('None of the selected leads are NeverBounce-verified. Verify them first, or turn off the filter.');
      }
    }

    // Check for missing emails
    const missingEmailCount = targetLeads.filter(l => !l.email).length;

    if (missingEmailCount > 0) {
      const proceed = window.confirm(
        `Warning: ${missingEmailCount} of the selected leads do not have email addresses. They can be added, but email sending will be skipped until enrichment is completed.\n\nDo you want to proceed?`
      );
      if (!proceed) return;
    }

    setAddingToCampaign(true);
    try {
      const res = await fetch('/api/campaigns/add-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          leadIds: targetLeads.map(l => l.id)
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully added ${data.addedCount} leads to campaign. (Skipped ${data.skippedCount} duplicates)`);
        setIsCampaignModalOpen(false);
        setSelectedIds(new Set());
        fetchLeads(); // refresh statuses
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add to campaign');
      }
    } catch (e) {
      alert('An unexpected error occurred.');
    } finally {
      setAddingToCampaign(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadData.businessName) return alert('Business Name is required.');
    setCreatingLead(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLeadData,
          source: 'Manual',
          status: 'New'
        })
      });
      
      if (res.status === 401) {
        alert('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }

      if (res.ok) {
        setIsAddLeadModalOpen(false);
        setNewLeadData({ businessName: '', email: '', phone: '', website: '', category: '', country: '' });
        fetchLeads(); // refresh the list
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add lead');
      }
    } catch (error) {
      alert('An unexpected error occurred.');
    } finally {
      setCreatingLead(false);
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;
  const noEmailCount = leads.filter(l => !l.email).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Client Lead Database</h2>
          <p className="text-slate-400">View and manage all generated client leads across campaigns.</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setIsAddLeadModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25"
          >
            <Plus size={16} />
            <span>Add Lead</span>
          </button>
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/25"
          >
            {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            <span>{verifying ? 'Verifying…' : 'Verify Leads'}</span>
          </button>
          {noEmailCount > 0 && (
            <button
              onClick={handleRemoveNoEmail}
              disabled={removingNoEmail}
              title="Delete all leads that have no email address"
              className="flex items-center space-x-2 px-4 py-2 bg-red-600/90 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg transition-colors shadow-lg shadow-red-500/20"
            >
              {removingNoEmail ? <Loader2 size={16} className="animate-spin" /> : <MailX size={16} />}
              <span>{removingNoEmail ? 'Removing…' : `Remove No-Email (${noEmailCount})`}</span>
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={handleOpenCampaignModal}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/25">
            <Plus size={16} />
            <span>Add to Campaign</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="sticky top-4 z-30 bg-purple-900/40 border border-purple-500/50 rounded-lg px-4 py-3 flex justify-between items-center shadow-2xl backdrop-blur-md">
          <span className="text-sm text-white font-bold">{selectedIds.size} {selectedIds.size === 1 ? 'lead' : 'leads'} selected</span>
          <div className="flex gap-2">
            <button
              onClick={handleOpenCampaignModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md border border-blue-500 flex items-center gap-1 font-medium transition-colors"
            >
              <Plus size={13} /> Add to Campaign
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs rounded-md border border-emerald-500 flex items-center gap-1 font-medium transition-colors"
            >
              {verifying ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {verifying ? 'Verifying…' : `Verify ${selectedIds.size}`}
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-md border border-slate-700 flex items-center gap-1"
            >
              <Download size={13} /> Export
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-md border border-slate-700 flex items-center gap-1"
            >
              <X size={13} /> Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs rounded-md border border-red-500 flex items-center gap-1 font-medium transition-colors"
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-3 justify-between items-center bg-slate-900/30">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 w-80">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search name, email, phone, website..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none ml-2 w-full text-sm text-white placeholder-slate-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white ml-1">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="All">All Tiers</option>
                <option value="Hot">🔥 Hot</option>
                <option value="Warm">🟡 Warm</option>
                <option value="Cold">❄️ Cold</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="All">All Status</option>
                <option value="New">New</option>
                <option value="Added to Campaign">Added to Campaign</option>
                <option value="Email Sent">Email Sent</option>
                <option value="Replied">Replied</option>
                <option value="Interested">Interested</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Call Booked">Call Booked</option>
                <option value="Closed">Closed</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <span className="text-slate-500 text-sm self-center pl-2">{filtered.length} leads</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-900 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4 font-medium">Business Name</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Verification</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Score / Tier</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Date Added</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                    Loading leads...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-800/50 text-slate-500 flex items-center justify-center rounded-full mb-4">
                        <Users size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">
                        {leads.length === 0 ? 'No client leads found yet' : 'No leads match your filters'}
                      </h3>
                      <p className="text-slate-400 max-w-sm">
                        {leads.length === 0
                          ? 'Start by using Find Client Leads to generate your first list.'
                          : 'Try adjusting your search or filter criteria.'}
                      </p>
                      {leads.length > 0 && (
                        <button
                          onClick={() => { setSearch(''); setTierFilter('All'); setStatusFilter('All'); }}
                          className="mt-4 text-sm text-purple-400 hover:text-purple-300"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr key={lead.id} className={`hover:bg-slate-800/30 transition-colors ${selectedIds.has(lead.id) ? 'bg-purple-900/10' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-slate-700 bg-slate-900 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 font-medium text-white">
                      <div>
                        <Link href={`/dashboard/leads/${lead.id}`} className="hover:text-blue-400 transition-colors">
                          {lead.name}
                        </Link>
                      </div>
                      {lead.category && <div className="text-[10px] text-slate-500 mt-0.5">{lead.category}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {lead.email ? (
                        <div>
                          <a href={`mailto:${lead.email}`} className="text-blue-400 hover:text-blue-300 text-xs font-mono underline underline-offset-2">
                            {lead.email}
                          </a>
                          <div><EmailStatusBadge status={lead.emailStatus} /></div>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">Not found</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <VerificationBadge verifiedAt={lead.emailVerifiedAt} hasEmail={!!lead.email} />
                    </td>
                    <td className="px-6 py-4">
                      <div>{lead.phone || '—'}</div>
                      <div className="text-xs text-slate-500">{lead.website || ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-blue-400">{lead.score}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
                          lead.tier === 'Hot' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          lead.tier === 'Warm' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {lead.tier}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium ${
                        lead.status === 'Call Booked' ? 'text-green-400' :
                        lead.status === 'Not Interested' ? 'text-red-400' :
                        lead.status === 'Added to Campaign' ? 'text-purple-400' :
                        lead.status === 'Interested' ? 'text-emerald-400' :
                        'text-slate-400'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{lead.created}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(lead.id)}
                        disabled={deleting === lead.id}
                        className="text-slate-500 hover:text-red-400 disabled:opacity-50 transition-colors p-1 rounded hover:bg-red-500/10"
                        title="Delete this lead"
                      >
                        {deleting === lead.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Trash2 size={16} />
                        }
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && !loading && (
          <div className="p-4 border-t border-slate-800 flex justify-between items-center text-sm text-slate-500">
            <div>
              {someSelected
                ? `${selectedIds.size} of ${filtered.length} selected`
                : `Showing ${filtered.length} of ${leads.length} leads`}
            </div>
          </div>
        )}
      </div>

      {/* Add to Campaign Modal */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-blue-400" />
                Add Leads to Campaign
              </h3>
              <button onClick={() => setIsCampaignModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(() => {
                const selectedLeads = leads.filter(l => selectedIds.has(l.id));
                const verifiedCount = selectedLeads.filter(l => l.emailVerifiedAt).length;
                const effectiveCount = onlyVerifiedForCampaign ? verifiedCount : selectedLeads.length;
                const missingEmail = selectedLeads.filter(l => !l.email).length;
                return (
                  <>
                    <p className="text-slate-300 text-sm">
                      You are adding <span className="font-bold text-white">{effectiveCount}</span> {effectiveCount === 1 ? 'lead' : 'leads'} to a campaign
                      {onlyVerifiedForCampaign && selectedLeads.length !== effectiveCount && (
                        <span className="text-slate-500"> ({selectedLeads.length - effectiveCount} unverified excluded)</span>
                      )}.
                    </p>

                    {/* NeverBounce-verified-only filter */}
                    <button
                      type="button"
                      onClick={() => setOnlyVerifiedForCampaign(v => !v)}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors text-left ${
                        onlyVerifiedForCampaign
                          ? 'bg-emerald-500/10 border-emerald-500/40'
                          : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <ShieldCheck size={16} className={onlyVerifiedForCampaign ? 'text-emerald-400' : 'text-slate-500'} />
                        <span className="flex flex-col">
                          <span className={`text-sm font-medium ${onlyVerifiedForCampaign ? 'text-emerald-300' : 'text-slate-300'}`}>
                            Only NeverBounce-verified leads
                          </span>
                          <span className="text-[11px] text-slate-500">{verifiedCount} of {selectedLeads.length} selected are verified</span>
                        </span>
                      </span>
                      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${onlyVerifiedForCampaign ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${onlyVerifiedForCampaign ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                    </button>

                    {missingEmail > 0 && !onlyVerifiedForCampaign && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg text-yellow-400 text-xs flex gap-2 items-start">
                        <span className="shrink-0">⚠️</span>
                        <p>Some leads do not have an email address yet. Enrich contact details before starting email outreach.</p>
                      </div>
                    )}
                  </>
                );
              })()}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Select Campaign</label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">-- Choose a Campaign --</option>
                  {campaigns.filter(c => c.status !== 'Completed' && c.status !== 'Archived' && c.status !== 'Deleted').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/20">
              <button
                onClick={() => setIsCampaignModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToCampaign}
                disabled={!selectedCampaignId || addingToCampaign}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {addingToCampaign && <Loader2 size={14} className="animate-spin" />}
                Add to Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-purple-400" />
                Add Lead Manually
              </h3>
              <button onClick={() => setIsAddLeadModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateLead}>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Business Name <span className="text-red-500">*</span></label>
                    <input 
                      required
                      type="text" 
                      value={newLeadData.businessName} 
                      onChange={e => setNewLeadData({...newLeadData, businessName: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. Acme Corp" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={newLeadData.email} 
                      onChange={e => setNewLeadData({...newLeadData, email: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. contact@acme.com" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Phone</label>
                    <input 
                      type="tel" 
                      value={newLeadData.phone} 
                      onChange={e => setNewLeadData({...newLeadData, phone: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. +1 234 567 8900" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Website</label>
                    <input 
                      type="url" 
                      value={newLeadData.website} 
                      onChange={e => setNewLeadData({...newLeadData, website: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. https://acme.com" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
                    <input 
                      type="text" 
                      value={newLeadData.category} 
                      onChange={e => setNewLeadData({...newLeadData, category: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. Software, Real Estate" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Country</label>
                    <input 
                      type="text" 
                      value={newLeadData.country} 
                      onChange={e => setNewLeadData({...newLeadData, country: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                      placeholder="e.g. United States" 
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/20">
                <button
                  type="button"
                  onClick={() => setIsAddLeadModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLead || !newLeadData.businessName}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {creatingLead && <Loader2 size={14} className="animate-spin" />}
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
