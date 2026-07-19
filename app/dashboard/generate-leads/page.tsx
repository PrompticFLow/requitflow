"use client";
import { useState } from "react";
import {
  Search, Loader2, Download, Plus, X, Building2, Mail,
  Linkedin, Phone, Globe, BadgeCheck, HelpCircle, Users2, MapPin,
} from "lucide-react";
import { AiAgentWorking } from "@/components/ui/ai-agent-working";

type Role = "hr_talent" | "founders_execs" | "sales_marketing";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "hr_talent", label: "HR & Talent", hint: "HR, People Ops, Talent Acquisition, Recruiters" },
  { value: "founders_execs", label: "Founders & Execs", hint: "Founders, CEOs, Owners, Presidents" },
  { value: "sales_marketing", label: "Sales & Marketing", hint: "VPs / Heads of Sales & Marketing" },
];

// People Data Labs company-size buckets (must match PDL values exactly).
const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-500", label: "201–500" },
  { value: "501-1000", label: "501–1,000" },
  { value: "1001-5000", label: "1,001–5,000" },
  { value: "5001-10000", label: "5,001–10,000" },
  { value: "10001+", label: "10,001+" },
];

// PDL indexes industry as an exact keyword, so users pick from the taxonomy.
const INDUSTRY_OPTIONS = [
  "computer software", "information technology and services", "internet",
  "marketing and advertising", "financial services", "banking", "insurance",
  "hospital & health care", "health, wellness and fitness", "medical devices",
  "staffing and recruiting", "human resources", "management consulting",
  "construction", "real estate", "retail", "e-learning", "education management",
  "automotive", "logistics and supply chain", "telecommunications",
  "accounting", "legal services", "restaurants", "hospitality",
  "mechanical or industrial engineering", "electrical/electronic manufacturing",
  "oil & energy", "pharmaceuticals", "nonprofit organization management",
];

interface Lead {
  id: string;
  businessName: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
  companySize?: string | null;
  address: string | null;
  fullName: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  email: string | null;
  emailStatus: string | null;
  leadScore: number;
  leadTier: string;
  aiInsight: string | null;
}

function EmailBadge({ status }: { status: string | null }) {
  if (status === "verified" || status === "likely") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
        <BadgeCheck size={12} /> Verified
      </span>
    );
  }
  if (status === "guessed") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] font-medium">
        <HelpCircle size={12} /> Best guess
      </span>
    );
  }
  return <span className="text-slate-600 text-[11px]">No email</span>;
}

export default function GenerateLeadsPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // criteria
  const [industry, setIndustry] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("United States");
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>(["hr_talent", "founders_execs"]);
  const [maxResults, setMaxResults] = useState(25);

  // selection + campaign
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [adding, setAdding] = useState(false);

  const toggleSize = (v: string) =>
    setCompanySizes((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]));

  const toggleRole = (v: Role) =>
    setRoles((prev) => (prev.includes(v) ? prev.filter((r) => r !== v) : [...prev, v]));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setProgress("AI Agent is searching for matching companies and decision-makers…");
    setSelectedLeads([]);
    setLeads([]);

    try {
      const res = await fetch("/api/leads/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, keywords, location, country, companySizes, roles, maxResults }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || data.error === "Unauthorized") {
          window.location.href = "/login";
          return;
        }
        throw new Error(data.error || "Search failed");
      }

      setLeads(data.leads || []);
      if (!data.leads || data.leads.length === 0) {
        setMessage(data.message || "No matching companies were found for these criteria.");
      } else if (data.notice) {
        setMessage(data.notice);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const allSelected = leads.length > 0 && selectedLeads.length === leads.length;
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) =>
    setSelectedLeads(e.target.checked ? leads.map((l) => l.id) : []);
  const handleSelect = (id: string) =>
    setSelectedLeads((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]));

  const handleExportCSV = () => {
    if (selectedLeads.length === 0) return alert("Select at least one lead to export.");
    const rowsData = leads.filter((l) => selectedLeads.includes(l.id));
    const headers = "Company,Industry,Website,Phone,Location,Contact,Title,LinkedIn,Email,Email Status,Score,Tier\n";
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = rowsData
      .map((l) =>
        [l.businessName, l.industry, l.website, l.phone, l.address, l.fullName, l.jobTitle,
         l.linkedinUrl, l.email, l.emailStatus, l.leadScore, l.leadTier].map(esc).join(",")
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "funnelzen_client_leads.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openCampaignModal = async () => {
    if (selectedLeads.length === 0) return alert("Select at least one lead to add to a campaign.");
    setShowModal(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaignId) return alert("Please select a campaign");
    setAdding(true);
    try {
      const res = await fetch("/api/campaigns/add-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaignId, leadIds: selectedLeads }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Added ${data.addedCount} leads to the campaign (${data.skippedCount} already in it).`);
        setShowModal(false);
        setSelectedLeads([]);
      } else {
        alert(data.error || "Failed to add leads");
      }
    } catch (e) {
      console.error(e);
    }
    setAdding(false);
  };

  const inputCls =
    "w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-violet-500 outline-none transition-colors";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Find Client Leads</h2>
        <p className="text-slate-400">
          Search a region for companies matching your criteria and get the decision-maker
          (HR, Talent, or Founder) with a work email — powered by People Data Labs.
        </p>
      </div>

      <div className="glass p-8 rounded-2xl border border-slate-700/50">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Industry</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls}>
                <option value="">Any industry</option>
                {INDUSTRY_OPTIONS.map((i) => (
                  <option key={i} value={i}>{i.replace(/\b[a-z]/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Title Keywords <span className="text-slate-500">(optional)</span></label>
              <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. recruiting, talent" className={inputCls} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">State / Region</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Texas" className={inputCls} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Country</label>
              <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Users2 size={14} /> Company Size <span className="text-slate-500">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SIZE_OPTIONS.map((s) => (
                  <button key={s.value} type="button" onClick={() => toggleSize(s.value)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      companySizes.includes(s.value)
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Decision-Maker Roles</label>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button key={r.value} type="button" onClick={() => toggleRole(r.value)} title={r.hint}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      roles.includes(r.value)
                        ? "bg-cyan-600 border-cyan-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-2 w-full sm:w-48">
              <label className="text-sm font-medium text-slate-300">Max Results</label>
              <input type="number" min={1} max={100} value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value) || 25)} className={inputCls} />
            </div>
            <button type="submit" disabled={loading}
              className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
              <span>{loading ? "Searching…" : "Find Client Leads"}</span>
            </button>
          </div>
        </form>

        {loading && (
          <div className="mt-8 p-6 bg-slate-900/50 rounded-xl border border-violet-500/20 flex items-center justify-center">
            <AiAgentWorking text={progress} />
          </div>
        )}

        {!loading && message && (
          <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 text-sm">
            {message}
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex flex-wrap gap-4 justify-between items-center">
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded border-slate-600 bg-slate-800"
                checked={allSelected} onChange={handleSelectAll} />
              <h3 className="text-xl font-semibold text-white">
                {leads.length} Leads <span className="text-slate-500 text-sm font-normal">({selectedLeads.length} selected)</span>
              </h3>
            </div>
            <div className="flex gap-3">
              <button onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
                <Download size={16} /> <span>Export CSV</span>
              </button>
              <button onClick={openCampaignModal}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-lg shadow-violet-500/25">
                <Plus size={16} /> <span>Add to Campaign</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-6">
            {leads.map((lead) => {
              const selected = selectedLeads.includes(lead.id);
              return (
                <div key={lead.id}
                  className={`rounded-xl border p-5 transition-all cursor-pointer ${
                    selected ? "border-violet-500 bg-violet-500/5" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                  onClick={() => handleSelect(lead.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <input type="checkbox" className="mt-1 rounded border-slate-600 bg-slate-800 shrink-0"
                        checked={selected} onChange={() => handleSelect(lead.id)} onClick={(e) => e.stopPropagation()} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-slate-400 shrink-0" />
                          <h4 className="font-semibold text-white truncate">{lead.businessName}</h4>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                          {lead.industry && <span>{lead.industry}</span>}
                          {lead.companySize && (
                            <span className="flex items-center gap-1"><Users2 size={11} /> {lead.companySize}</span>
                          )}
                          {lead.address && (
                            <span className="flex items-center gap-1"><MapPin size={11} /> {lead.address}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                      lead.leadTier === "Hot" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : lead.leadTier === "Warm" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                    }`}>
                      {lead.leadTier} · {lead.leadScore}
                    </span>
                  </div>

                  {/* Company contact row */}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
                    {lead.website && (
                      <a href={lead.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 hover:text-cyan-400 transition-colors">
                        <Globe size={12} /> Website
                      </a>
                    )}
                    {lead.phone && (
                      <span className="flex items-center gap-1"><Phone size={12} /> {lead.phone}</span>
                    )}
                  </div>

                  {/* Decision-maker block */}
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {lead.fullName || "Contact unavailable"}
                        </p>
                        {lead.jobTitle && <p className="text-xs text-slate-400 truncate">{lead.jobTitle}</p>}
                      </div>
                      {lead.linkedinUrl && (
                        <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-slate-400 hover:text-cyan-400 transition-colors shrink-0" title="LinkedIn">
                          <Linkedin size={16} />
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 truncate">
                          <Mail size={12} className="shrink-0" /> <span className="truncate">{lead.email}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600">No email found</span>
                      )}
                      <EmailBadge status={lead.emailStatus} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-white mb-2">Add to Campaign</h3>
            <p className="text-slate-400 mb-6">Enroll {selectedLeads.length} leads into a campaign.</p>
            <div className="space-y-4">
              <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none">
                <option value="">-- Select Campaign --</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button onClick={handleAddToCampaign} disabled={adding || !selectedCampaignId}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-medium transition-all shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2">
                {adding ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                <span>{adding ? "Adding…" : "Add Leads"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
