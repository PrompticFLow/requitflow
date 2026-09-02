"use client";
import { useState, useEffect, useCallback } from "react";
import Link from 'next/link';
import { Search, Filter, Download, Plus, Trash2, Loader2, Users, X, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, ShieldQuestion, MailX, Briefcase, Pencil, Phone } from "lucide-react";
import CreateCampaignModal from "../campaigns/CreateCampaignModal";

const EMAIL_STATUS_STYLES: Record<string, string> = {
  Valid: 'bg-green-500/20 text-green-400 border-green-500/30',
  Verified: 'bg-green-500/20 text-green-400 border-green-500/30',
  Invalid: 'bg-red-500/20 text-red-400 border-red-500/30',
  Risky: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Disposable: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Catchall: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// Oppora verification — shows the deliverability result (Valid/Catchall/Unknown/…) once checked.
function VerificationBadge({ verifiedAt, status, hasEmail }: { verifiedAt: string | null; status: string | null; hasEmail: boolean }) {
  if (!hasEmail) {
    return <span className="text-slate-600 text-xs">—</span>;
  }
  if (verifiedAt) {
    const when = new Date(verifiedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const style = (status && EMAIL_STATUS_STYLES[status]) || 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    return (
      <div className="inline-flex flex-col items-start gap-0.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${style}`}>
          <ShieldCheck size={11} className="shrink-0" />
          {status || 'Verified'}
        </span>
        <span className="text-[9px] text-slate-500 pl-1">Oppora · {when}</span>
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

const HIRING_STATUS_STYLES: Record<string, string> = {
  'Hiring': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Not Hiring': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Unknown': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// Perplexity (via OpenRouter) hiring research — careers pages, LinkedIn Jobs, job boards.
function HiringBadge({ lead }: { lead: any }) {
  if (!lead.hiringCheckedAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-slate-600 bg-slate-800/40 text-slate-400">
        <Briefcase size={11} className="shrink-0" />
        Not checked
      </span>
    );
  }
  const when = new Date(lead.hiringCheckedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const style = HIRING_STATUS_STYLES[lead.hiringStatus] || HIRING_STATUS_STYLES['Unknown'];
  const label = lead.hiringStatus === 'Hiring' && lead.hiringJobCount
    ? `Hiring · ${lead.hiringJobCount} ${lead.hiringJobCount === 1 ? 'job' : 'jobs'}`
    : (lead.hiringStatus || 'Unknown');
  return (
    <div className="inline-flex flex-col items-start gap-0.5 max-w-[180px]">
      <span
        title={lead.hiringSignal || undefined}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${style}`}
      >
        <Briefcase size={11} className="shrink-0" />
        {label}
      </span>
      {lead.hiringSignal && (
        <span className="text-[9px] text-slate-500 pl-1 line-clamp-2" title={lead.hiringSignal}>{lead.hiringSignal}</span>
      )}
      <span className="text-[9px] text-slate-500 pl-1">
        {lead.hiringSourceUrl ? (
          <a href={lead.hiringSourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 underline underline-offset-2">
            Source
          </a>
        ) : null}
        {lead.hiringSourceUrl ? ' · ' : ''}Perplexity · {when}
      </span>
    </div>
  );
}

export default function LeadDatabasePage() {
  const [leads, setLeads] = useState<any[]>([]);
  // Filtering/paging happens server-side, so the table rows are just `leads`;
  // deriving them (instead of a second state) keeps in-place patches (verify, phones, hiring) visible without a refetch.
  const filtered = leads;
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [hiringFilter, setHiringFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [findingPhones, setFindingPhones] = useState(false);
  const [checkingHiring, setCheckingHiring] = useState(false);
  const [hiringProgress, setHiringProgress] = useState<{ done: number; total: number } | null>(null);
  const [removingNoEmail, setRemovingNoEmail] = useState(false);

  // New states for campaigns
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [onlyVerifiedForCampaign, setOnlyVerifiedForCampaign] = useState(false);

  // Manual lead creation
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const emptyLeadForm = {
    businessName: '',
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    website: '',
    category: '',
    country: ''
  };
  const [newLeadData, setNewLeadData] = useState(emptyLeadForm);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tierFilter, statusFilter, hiringFilter]);

  const mapLead = (l: any) => ({
    id: l.id,
    name: l.businessName,
    fullName: l.fullName || null,
    jobTitle: l.jobTitle || null,
    email: l.email || null,
    phone: l.phone || null,
    phoneStatus: l.phoneStatus || null,
    website: l.website || null,
    score: l.leadScore || 0,
    tier: l.leadTier || "Cold",
    status: l.status || "New",
    category: l.category || null,
    country: l.country || null,
    emailStatus: l.emailStatus || null,
    emailVerifiedAt: l.emailVerifiedAt || null,
    hiringStatus: l.hiringStatus || null,
    hiringSignal: l.hiringSignal || null,
    hiringSourceUrl: l.hiringSourceUrl || null,
    hiringJobCount: l.hiringJobCount ?? null,
    hiringCheckedAt: l.hiringCheckedAt || null,
    created: new Date(l.createdAt).toLocaleDateString()
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (tierFilter !== 'All') params.set('tier', tierFilter);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (hiringFilter !== 'All') params.set('hiringStatus', hiringFilter);

      const res = await fetch(`/api/leads?${params}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.leads) {
        const mapped = data.leads.map(mapLead);
        setLeads(mapped);
      }
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, tierFilter, statusFilter, hiringFilter]);

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

  // Verify emails via Oppora
  const handleVerify = async () => {
    const scope = selectedIds.size > 0 ? filtered.filter(l => selectedIds.has(l.id)) : filtered;
    const withEmail = scope.filter(l => l.email);

    // Never verify the same email twice — skip anything already run through Oppora.
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
    if (!confirm(`Verify ${targets.length} ${targets.length === 1 ? 'lead' : 'leads'}?\n\nUses ${uniqueEmails} Oppora ${uniqueEmails === 1 ? 'credit' : 'credits'}.${alreadyNote}`)) return;

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
      const warnNote = data.warning && !data.errors?.length ? `\n\n${data.warning}` : '';
      alert(`Verified ${data.verified} ${data.verified === 1 ? 'lead' : 'leads'}\n\n${breakdown}${errorNote}${warnNote}`);
    } catch {
      alert('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Populate phone numbers via Oppora for the selected leads (or the current filtered list).
  const handleFindPhones = async () => {
    const scope = selectedIds.size > 0 ? filtered.filter(l => selectedIds.has(l.id)) : filtered;
    const withoutPhone = scope.filter(l => !l.phone);

    if (withoutPhone.length === 0) {
      alert(scope.length === 0 ? 'No leads to look up.' : 'All selected leads already have a phone number.');
      return;
    }

    // Skip leads Oppora already came up empty on, unless the user explicitly wants a retry.
    let targets = withoutPhone.filter(l => l.phoneStatus !== 'NotFound');
    let force = false;
    const previouslyMissed = withoutPhone.length - targets.length;

    if (targets.length === 0) {
      if (!confirm(`All ${withoutPhone.length} selected ${withoutPhone.length === 1 ? 'lead was' : 'leads were'} already looked up with no phone found.\n\nTry again anyway? (No charge for misses.)`)) return;
      targets = withoutPhone;
      force = true;
    } else {
      const missedNote = previouslyMissed > 0 ? `\n${previouslyMissed} previously not found (skipped).` : '';
      if (!confirm(`Look up phone numbers for ${targets.length} ${targets.length === 1 ? 'lead' : 'leads'}?\n\nUses 1 Oppora phone credit per number found — no charge for misses.${missedNote}`)) return;
    }

    setFindingPhones(true);
    try {
      const res = await fetch('/api/leads/find-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: targets.map(l => l.id), force })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Phone lookup failed.');
        return;
      }

      // Patch phones in place so the table updates without a refetch.
      const byId = new Map<string, any>((data.results || []).map((r: any) => [r.id, r]));
      setLeads(prev => prev.map(l => (byId.has(l.id)
        ? { ...l, phone: byId.get(l.id).phone ?? l.phone, phoneStatus: byId.get(l.id).phoneStatus }
        : l)));

      if (data.message) {
        alert(data.message);
        return;
      }
      const notes: string[] = [];
      if (data.notFound) notes.push(`${data.notFound} not found`);
      if (data.skippedNoIdentity) notes.push(`${data.skippedNoIdentity} skipped (need a LinkedIn URL or name + company)`);
      if (data.errors?.length) notes.push(`${data.errors.length} failed — ${data.errors[0]}`);
      else if (data.warning) notes.push(data.warning);
      alert(`Found ${data.found} phone ${data.found === 1 ? 'number' : 'numbers'}${notes.length ? `\n\n${notes.join('\n')}` : ''}`);
    } catch {
      alert('Phone lookup failed. Please try again.');
    } finally {
      setFindingPhones(false);
    }
  };

  // Research hiring status via Perplexity (OpenRouter) — careers page, LinkedIn, job boards.
  const handleCheckHiring = async () => {
    const scope = selectedIds.size > 0 ? filtered.filter(l => selectedIds.has(l.id)) : filtered;
    if (scope.length === 0) {
      alert('No leads to check.');
      return;
    }

    let targets = scope.filter(l => !l.hiringCheckedAt);
    let force = false;
    const alreadyChecked = scope.length - targets.length;

    if (targets.length === 0) {
      // Everything in scope was checked before — offer a fresh re-check since hiring goes stale.
      if (!confirm(`All ${scope.length} selected ${scope.length === 1 ? 'lead has' : 'leads have'} already been checked.\n\nRe-check them for fresh hiring data?`)) return;
      targets = scope;
      force = true;
    } else {
      const alreadyNote = alreadyChecked > 0 ? `\n${alreadyChecked} already checked (skipped).` : '';
      if (!confirm(`Research hiring status for ${targets.length} ${targets.length === 1 ? 'lead' : 'leads'}?\n\nUses Perplexity web search (one lookup per lead) to scan careers pages, LinkedIn and job boards.${alreadyNote}`)) return;
    }

    setCheckingHiring(true);
    setHiringProgress({ done: 0, total: targets.length });

    const BATCH = 10;
    let checked = 0;
    const summary: Record<string, number> = {};
    const errors: string[] = [];

    try {
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        const res = await fetch('/api/leads/check-hiring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadIds: batch.map(l => l.id), force })
        });
        const data = await res.json();

        if (!res.ok) {
          errors.push(data.error || 'Request failed.');
        } else {
          checked += data.checked || 0;
          Object.entries(data.summary || {}).forEach(([k, v]) => { summary[k] = (summary[k] || 0) + (v as number); });
          if (data.errors?.length) errors.push(...data.errors);

          // Patch results in place so badges update while later batches run.
          const byId = new Map<string, any>((data.results || []).map((r: any) => [r.id, r]));
          setLeads(prev => prev.map(l => (byId.has(l.id) ? { ...l, ...byId.get(l.id) } : l)));
        }
        setHiringProgress({ done: Math.min(i + batch.length, targets.length), total: targets.length });
      }

      const breakdown = Object.entries(summary).map(([status, count]) => `${status}: ${count}`).join('\n');
      const errorNote = errors.length ? `\n\n${errors.length} failed — ${errors[0]}` : '';
      alert(`Checked hiring status for ${checked} ${checked === 1 ? 'lead' : 'leads'}\n\n${breakdown || 'No results.'}${errorNote}`);
    } catch {
      alert('Hiring check failed. Please try again.');
    } finally {
      setCheckingHiring(false);
      setHiringProgress(null);
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
    const headers = "Business Name,Email,Phone,Website,Category,Score,Tier,Status,Hiring,Hiring Jobs,Hiring Evidence,Hiring Source,Country,Date Added\n";
    const rows = toExport.map(l =>
      `"${(l.name || '').replace(/"/g, '""')}","${l.email || ''}","${l.phone || ''}","${l.website || ''}","${l.category || ''}","${l.score}","${l.tier}","${l.status}","${l.hiringCheckedAt ? (l.hiringStatus || 'Unknown') : 'Not Checked'}","${l.hiringJobCount ?? ''}","${(l.hiringSignal || '').replace(/"/g, '""')}","${l.hiringSourceUrl || ''}","${l.country || ''}","${l.created}"`
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

    // Optionally restrict to leads Oppora has verified.
    let targetLeads = leads.filter(l => selectedIds.has(l.id));
    if (onlyVerifiedForCampaign) {
      targetLeads = targetLeads.filter(l => l.emailVerifiedAt);
      if (targetLeads.length === 0) {
        return alert('None of the selected leads are Oppora-verified. Verify them first, or turn off the filter.');
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

  const openAddLeadModal = () => {
    setEditingLeadId(null);
    setNewLeadData(emptyLeadForm);
    setIsAddLeadModalOpen(true);
  };

  const openEditLeadModal = (lead: any) => {
    setEditingLeadId(lead.id);
    setNewLeadData({
      businessName: lead.name || '',
      fullName: lead.fullName || '',
      jobTitle: lead.jobTitle || '',
      email: lead.email || '',
      phone: lead.phone || '',
      website: lead.website || '',
      category: lead.category || '',
      country: lead.country || ''
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadData.businessName) return alert('Business Name is required.');
    setCreatingLead(true);
    try {
      // Derive first/last name from the contact name for email personalization
      const nameParts = (newLeadData.fullName || '').trim().split(/\s+/).filter(Boolean);
      const personFields = {
        fullName: newLeadData.fullName?.trim() || null,
        firstName: nameParts[0] || null,
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
        jobTitle: newLeadData.jobTitle?.trim() || null,
      };

      const res = await fetch(editingLeadId ? `/api/leads/${editingLeadId}` : '/api/leads', {
        method: editingLeadId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLeadData,
          ...personFields,
          ...(editingLeadId ? {} : { source: 'Manual', status: 'New' })
        })
      });

      if (res.status === 401) {
        alert('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }

      if (res.ok) {
        setIsAddLeadModalOpen(false);
        setEditingLeadId(null);
        setNewLeadData(emptyLeadForm);
        fetchLeads(); // refresh the list
      } else {
        const err = await res.json();
        alert(err.error || (editingLeadId ? 'Failed to update lead' : 'Failed to add lead'));
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
            onClick={openAddLeadModal}
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
          <button
            onClick={handleFindPhones}
            disabled={findingPhones}
            title="Look up phone numbers via Oppora for leads that don't have one"
            className="flex items-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white rounded-lg transition-colors shadow-lg shadow-amber-500/25"
          >
            {findingPhones ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
            <span>{findingPhones ? 'Finding…' : 'Find Phones'}</span>
          </button>
          <button
            onClick={handleCheckHiring}
            disabled={checkingHiring}
            title="Research each lead's hiring status (careers page, LinkedIn, job boards) via Perplexity"
            className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
          >
            {checkingHiring ? <Loader2 size={16} className="animate-spin" /> : <Briefcase size={16} />}
            <span>
              {checkingHiring
                ? `Checking${hiringProgress ? ` ${hiringProgress.done}/${hiringProgress.total}` : '…'}`
                : 'Check Hiring'}
            </span>
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
              onClick={handleFindPhones}
              disabled={findingPhones}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs rounded-md border border-amber-500 flex items-center gap-1 font-medium transition-colors"
            >
              {findingPhones ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
              {findingPhones ? 'Finding…' : `Find Phones ${selectedIds.size}`}
            </button>
            <button
              onClick={handleCheckHiring}
              disabled={checkingHiring}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs rounded-md border border-cyan-500 flex items-center gap-1 font-medium transition-colors"
            >
              {checkingHiring ? <Loader2 size={13} className="animate-spin" /> : <Briefcase size={13} />}
              {checkingHiring
                ? `Checking${hiringProgress ? ` ${hiringProgress.done}/${hiringProgress.total}` : '…'}`
                : `Check Hiring ${selectedIds.size}`}
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
            <div className="relative">
              <select
                value={hiringFilter}
                onChange={e => setHiringFilter(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="All">All Hiring</option>
                <option value="Hiring">💼 Hiring</option>
                <option value="Not Hiring">Not Hiring</option>
                <option value="Unknown">Unknown</option>
                <option value="Not Checked">Not Checked</option>
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
                <th className="px-6 py-4 font-medium">Hiring</th>
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
                  <td colSpan={10} className="px-6 py-16 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                    Loading leads...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center">
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
                          onClick={() => { setSearch(''); setTierFilter('All'); setStatusFilter('All'); setHiringFilter('All'); }}
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
                      {(lead.fullName || lead.jobTitle) && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {lead.fullName || 'Unknown contact'}{lead.jobTitle ? ` · ${lead.jobTitle}` : ''}
                        </div>
                      )}
                      {lead.category && <div className="text-[10px] text-slate-500 mt-0.5">{lead.category}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-blue-400 hover:text-blue-300 text-xs font-mono underline underline-offset-2">
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-slate-600 text-xs">Not found</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <VerificationBadge verifiedAt={lead.emailVerifiedAt} status={lead.emailStatus} hasEmail={!!lead.email} />
                    </td>
                    <td className="px-6 py-4">
                      <HiringBadge lead={lead} />
                    </td>
                    <td className="px-6 py-4">
                      <div>{lead.phone || (lead.phoneStatus === 'NotFound' ? <span className="text-slate-600 text-xs">Not found</span> : '—')}</div>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditLeadModal(lead)}
                          className="text-slate-500 hover:text-purple-400 transition-colors p-1 rounded hover:bg-purple-500/10"
                          title="Edit this lead"
                        >
                          <Pencil size={15} />
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && pagination.total > 0 && (
          <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-between items-center text-sm text-slate-500">
            <div>
              {someSelected
                ? `${selectedIds.size} of ${filtered.length} selected on this page`
                : `Showing ${pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} leads`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40 hover:border-purple-500/50 flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-slate-400 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40 hover:border-purple-500/50 flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
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

                    {/* Oppora-verified-only filter */}
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
                            Only Oppora-verified leads
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
                <div className="flex gap-2 items-stretch">
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">-- Choose a Campaign --</option>
                    {campaigns.filter(c => c.status !== 'Completed' && c.status !== 'Archived' && c.status !== 'Deleted').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCreateCampaignOpen(true)}
                    className="shrink-0 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Create Campaign
                  </button>
                </div>
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

      <CreateCampaignModal
        isOpen={isCreateCampaignOpen}
        onClose={() => setIsCreateCampaignOpen(false)}
        onSuccess={async (campaign) => {
          setIsCreateCampaignOpen(false);
          await fetchCampaigns();
          if (campaign?.id) setSelectedCampaignId(campaign.id);
        }}
      />

      {/* Add Lead Modal */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {editingLeadId ? <Pencil size={18} className="text-purple-400" /> : <Plus size={18} className="text-purple-400" />}
                {editingLeadId ? 'Edit Lead' : 'Add Lead Manually'}
              </h3>
              <button onClick={() => { setIsAddLeadModalOpen(false); setEditingLeadId(null); }} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveLead}>
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
                    <label className="block text-sm font-medium text-slate-400 mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      value={newLeadData.fullName}
                      onChange={e => setNewLeadData({...newLeadData, fullName: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Role / Job Title</label>
                    <input
                      type="text"
                      value={newLeadData.jobTitle}
                      onChange={e => setNewLeadData({...newLeadData, jobTitle: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      placeholder="e.g. Founder, HR Manager"
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
                  onClick={() => { setIsAddLeadModalOpen(false); setEditingLeadId(null); }}
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
                  {editingLeadId ? 'Update Lead' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
