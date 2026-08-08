"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Mail, Sparkles, Check, X, RefreshCw, Loader2, Plus, Play,
  Pause, Trash2, Edit2, Target, Eye, FileText, Filter, ChevronRight,
  ChevronLeft, AlertTriangle, Users, Zap, ArrowRight, Clock, BarChart2,
  CheckCircle2, XCircle, AlertCircle, Info, Send, BookOpen, Settings2,
  Shield, MessageSquare
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────
type Campaign = {
  id: string; name: string; status: string; campaignType?: string;
  targetAudience?: string; offer?: string; senderEmail?: string;
  bookingLink?: string; unsubscribeLine?: string; goal?: string;
  tone?: string; language?: string; ctaType?: string; ctaLink?: string;
  problemSolved?: string; mainBenefit?: string; proofCaseStudy?: string;
  personalizationLevel?: string; emailLength?: string; spamSafety?: string;
  ctaStyle?: string; dailyLimit?: number; followUpCount?: number;
  createdAt?: string;
  _count?: { leads: number; emailSequences: number; replies: number; bookedCalls: number; campaignLeads: number };
  totalDrafts?: number; pendingReview?: number; approvedEmail1?: number;
};

type EmailDraft = {
  id: string; subject: string; body: string; previewText?: string;
  sequenceStep: number; approvalStatus: string; status: string;
  spamRisk?: string; personalizationScore?: number; aiGenerationReason?: string;
  editedSubject?: string; editedBody?: string; aiOriginalSubject?: string;
  aiOriginalBody?: string; emailType?: string; purpose?: string;
  campaignId: string; leadId: string;
  campaign?: { id: string; name: string };
  lead?: { id: string; businessName: string; email?: string; category?: string; location?: string };
};

type Lead = {
  id: string; businessName: string; email?: string; status: string;
  category?: string; location?: string;
};

type ReadinessItem = { key: string; label: string; passed: boolean; actionHint: string };

// ─── Default wizard state ────────────────────────────────────────────────────
const defaultWizard = {
  // Step 1
  name: "Client Outreach Campaign", clientName: "Track2Digital", industry: "AI Automation", campaignType: "Client Outreach", language: "English",
  tone: "Professional, warm, direct", senderEmail: "", senderName: "", goal: "Book Discovery Call", targetLocation: "",
  // Step 3
  targetAudience: "Small business owners in the United States", offer: "AI follow-up automation and call booking system", problemSolved: "Leads are lost because follow-up is slow or manual", desiredOutcome: "More qualified booked calls with less manual work",
  trustReason: "", proofCaseStudy: "", callToAction: "Book a 15-minute strategy call", bookingGoal: "",
  commonObjections: "", doNotMention: "", personalizationStyle: "Professional", followUpStyle: "Value-driven",
  unsubscribeLine: "To unsubscribe, reply with STOP.",
  mainBenefit: "", ctaType: "", bookingLink: "https://calendly.com/demo/strategy-call",
  // Step 4 — sequence
  followUpCount: 5,
  sequenceSteps: [
    { step: 1, name: "Intro", delayDays: 0, emailType: "Introduction", purpose: "Personalized intro with soft CTA", enabled: true, extraInstruction: "" },
    { step: 2, name: "Follow-up", delayDays: 2, emailType: "Follow-up", purpose: "Follow up, ask one question", enabled: true, extraInstruction: "" },
    { step: 3, name: "Problem-based", delayDays: 5, emailType: "Problem", purpose: "Address the core problem", enabled: true, extraInstruction: "" },
    { step: 4, name: "Benefit / Proof", delayDays: 8, emailType: "Benefit", purpose: "Highlight key benefit or case study", enabled: true, extraInstruction: "" },
    { step: 5, name: "Final Follow-up", delayDays: 12, emailType: "Final", purpose: "Respectful last follow-up with opt-out", enabled: true, extraInstruction: "" },
  ],
  // Step 5
  personalizationLevel: "Medium", emailLength: "Short",
  spamSafety: "High", ctaStyle: "Soft",
  dailyLimit: 50,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getNextAction(camp: Campaign): { label: string; action: string } {
  const leads = camp._count?.campaignLeads ?? camp._count?.leads ?? 0;
  if (leads === 0) return { label: "Add leads", action: "addLeads" };
  if ((camp.totalDrafts ?? 0) === 0) return { label: "Generate AI emails", action: "generate" };
  if ((camp.pendingReview ?? 0) > 0) return { label: "Review & approve Email 1", action: "review" };
  if (!camp.bookingLink && !camp.ctaLink) return { label: "Add booking link", action: "edit" };
  if (!camp.senderEmail) return { label: "Connect sender email", action: "settings" };
  if (!camp.unsubscribeLine) return { label: "Add unsubscribe line", action: "edit" };
  if (camp.status === "Active") return { label: "Monitor replies", action: "replies" };
  if (camp.status === "Paused") return { label: "Resume campaign", action: "resume" };
  return { label: "Start campaign", action: "start" };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Draft: "bg-slate-700/50 text-slate-300 border-slate-600",
    "Generating Emails": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Pending Review": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Ready to Start": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Active: "bg-green-500/10 text-green-400 border-green-500/20",
    Paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Completed: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    Archived: "bg-slate-700/50 text-slate-400 border-slate-600",
  };
  const cls = map[status] || "bg-slate-700/50 text-slate-300 border-slate-600";
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>{status}</span>;
}

function ApprovalBadge({ status, spamRisk }: { status: string; spamRisk?: string }) {
  if (spamRisk === "High") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">⚠ High Spam</span>;
  if (status === "Approved") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">✓ Approved</span>;
  if (status === "Rejected") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">✗ Rejected</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>;
}

function InputField({ label, helper, required, children }: { label: string; helper?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
async function parseApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  let data: any = null;

  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Invalid JSON response: ${rawText.slice(0, 300)}`
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.technicalError ||
        data?.error ||
        `Request failed: ${response.status} ${rawText.slice(0, 300) || "Empty response"}`
    );
  }

  if (!data) {
    throw new Error(
      `Empty JSON response from API. Status: ${response.status}`
    );
  }

  return data;
}

export default function AIEmailAgentPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState(false);

  // — Campaign Hub state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(true);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("All");

  // — Create wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ ...defaultWizard });
  const [wizardCampaignId, setWizardCampaignId] = useState<string | null>(null);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardGenerating, setWizardGenerating] = useState(false);
  const [wizardLeads, setWizardLeads] = useState<Lead[]>([]);
  const [wizardLeadSearch, setWizardLeadSearch] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [wizardLeadsLoading, setWizardLeadsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ total: number; done: number; message: string } | null>(null);

  // — Edit campaign state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // — Delete confirm
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteHasSent, setDeleteHasSent] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // — Generate confirm
  const [generateModalId, setGenerateModalId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // — Active AI Provider
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  // — Readiness modal
  const [readinessModal, setReadinessModal] = useState<{ open: boolean; campaignId: string | null; items: ReadinessItem[] }>({
    open: false, campaignId: null, items: []
  });

  // — Start confirm modal
  const [startConfirmId, setStartConfirmId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // — Pending Emails state
  const [pendingEmails, setPendingEmails] = useState<EmailDraft[]>([]);
  const [fetchingEmails, setFetchingEmails] = useState(true);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailFilter, setEmailFilter] = useState("All");
  const [emailCampaignFilter, setEmailCampaignFilter] = useState("All");
  const [emailStepFilter, setEmailStepFilter] = useState("All");
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);

  // — Preview modal
  const [previewEmail, setPreviewEmail] = useState<EmailDraft | null>(null);

  // — Edit email modal
  const [editEmailModal, setEditEmailModal] = useState<{ open: boolean; email: EmailDraft | null }>({ open: false, email: null });
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // — Regenerate modal
  const [regenModal, setRegenModal] = useState<{ open: boolean; email: EmailDraft | null }>({ open: false, email: null });
  const [regenerating, setRegenerating] = useState(false);

  // — Bulk action confirm
  const [bulkModal, setBulkModal] = useState<{ open: boolean; action: string; count: number } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // — Delete email state
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setFetchingCampaigns(true);
    try {
      const res = await fetch("/api/campaigns", { credentials: "include" });
      if (res.status === 401) { setAuthError(true); return; }
      console.log("AI EMAIL AGENT FETCH CAMPAIGNS URL:", res.url);
      const data = await parseApiResponse(res);
      const fetchedCampaigns = Array.isArray(data) ? data : data.campaigns || data.data || [];
      if (!data.success && data.error) {
        throw new Error(data.error || "Failed to fetch campaigns.");
      }
      setCampaigns(fetchedCampaigns);
    } catch (err) { console.error(err); }
    finally { setFetchingCampaigns(false); }
  }, []);

  const fetchProvider = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/provider", { credentials: "include" });
      const data = await parseApiResponse(res);
      setActiveProvider(data.provider);
    } catch { }
  }, []);

  const fetchEmails = useCallback(async () => {
    setFetchingEmails(true);
    try {
      const params = new URLSearchParams();
      if (emailFilter !== "All") params.set("status", emailFilter);
      if (emailCampaignFilter !== "All") params.set("campaignId", emailCampaignFilter);
      if (emailStepFilter !== "All") params.set("step", emailStepFilter);
      if (emailSearch) params.set("search", emailSearch);
      const res = await fetch(`/api/email-sequences/pending-review?${params}`, { credentials: "include" });
      if (res.status === 401) { setAuthError(true); return; }
      const data = await parseApiResponse(res);
      if (data.pendingEmails) setPendingEmails(data.pendingEmails);
    } catch (err) { console.error(err); }
    finally { setFetchingEmails(false); }
  }, [emailFilter, emailCampaignFilter, emailStepFilter, emailSearch]);

  useEffect(() => {
    fetchCampaigns();
    fetchProvider();
  }, [fetchCampaigns, fetchProvider]);

  const fetchWizardLeads = useCallback(async () => {
    setWizardLeadsLoading(true);
    try {
      const res = await fetch("/api/leads?limit=500", { credentials: "include" });
      const data = await parseApiResponse(res);
      if (data.leads) setWizardLeads(data.leads);
    } catch { }
    finally { setWizardLeadsLoading(false); }
  }, []);

  // ─── Wizard ───────────────────────────────────────────────────────────────
  const openWizard = () => {
    setWizardData({ ...defaultWizard });
    setWizardCampaignId(null);
    setSelectedLeadIds([]);
    setWizardStep(1);
    setGenerationProgress(null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setWizardCampaignId(null);
    setGenerationProgress(null);
  };

  const handleWizardNext = async () => {
    // Step 1 → save campaign to DB
    if (wizardStep === 1) {
      if (!wizardData.name.trim()) return alert("Campaign name is required.");
      setWizardSaving(true);
      try {
        const method = wizardCampaignId ? "PATCH" : "POST";
        const url = wizardCampaignId ? `/api/campaigns/${wizardCampaignId}` : "/api/campaigns";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: wizardData.name, campaignType: wizardData.campaignType,
            language: wizardData.language, tone: wizardData.tone,
            senderEmail: wizardData.senderEmail, goal: wizardData.goal,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.details ? `${data.error} Details: ${data.details}` : data.error || "Failed to save campaign");
        setWizardCampaignId(data.campaign.id);
      } catch (err: any) { alert(err.message || "An error occurred. Please try again."); return; }
      finally { setWizardSaving(false); }
    }

    // Step 1 → Step 2: load leads
    if (wizardStep === 1) fetchWizardLeads();

    // Step 2 → add selected leads to campaign
    if (wizardStep === 2 && wizardCampaignId && selectedLeadIds.length > 0) {
      setWizardSaving(true);
      try {
        await fetch("/api/campaigns/add-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: wizardCampaignId, leadIds: selectedLeadIds })
        });
      } catch { }
      finally { setWizardSaving(false); }
    }

    // Step 3 → save offer/CTA fields
    if (wizardStep === 3 && wizardCampaignId) {
      setWizardSaving(true);
      try {
        await fetch(`/api/campaigns/${wizardCampaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetAudience: wizardData.targetAudience, offer: wizardData.offer,
            problemSolved: wizardData.problemSolved, desiredOutcome: wizardData.desiredOutcome,
            proofCaseStudy: wizardData.proofCaseStudy, callToAction: wizardData.callToAction,
            bookingLink: wizardData.bookingLink, ctaLink: wizardData.bookingLink,
            unsubscribeLine: wizardData.unsubscribeLine,
            clientName: wizardData.clientName, industry: wizardData.industry, targetLocation: wizardData.targetLocation,
            trustReason: wizardData.trustReason, commonObjections: wizardData.commonObjections, doNotMention: wizardData.doNotMention
          })
        });
      } catch { }
      finally { setWizardSaving(false); }
    }

    // Step 5 → save AI writing settings
    if (wizardStep === 5 && wizardCampaignId) {
      setWizardSaving(true);
      try {
        await fetch(`/api/campaigns/${wizardCampaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            personalizationLevel: wizardData.personalizationLevel,
            emailLength: wizardData.emailLength, spamSafety: wizardData.spamSafety,
            ctaStyle: wizardData.ctaStyle, dailyLimit: wizardData.dailyLimit,
          })
        });
      } catch { }
      finally { setWizardSaving(false); }
    }

    setWizardStep(s => s + 1);
  };

  const handleWizardGenerate = async () => {
    if (!wizardCampaignId) return;
    if (selectedLeadIds.length === 0) {
      return alert("No leads selected. Go back to Step 2 and select at least one lead.");
    }
    setWizardGenerating(true);
    setGenerationProgress({ total: selectedLeadIds.length, done: 0, message: "Preparing AI drafts..." });
    try {
      const res = await fetch(`/api/campaigns/${wizardCampaignId}/generate-email-sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds: selectedLeadIds })
      });
      const data = await res.json();
      if (res.ok) {
        let msg = data.message || `AI created ${data.totalDrafts || 0} drafts. Review and approve Email 1 before starting.`;
        if (data.fallbackCreated > 0) {
          msg = "Some AI responses were invalid, so safe fallback drafts were created for review. " + msg;
        }
        setGenerationProgress({
          total: selectedLeadIds.length,
          done: data.created || selectedLeadIds.length,
          message: msg
        });
        fetchCampaigns();
      } else {
        setGenerationProgress({ total: 0, done: 0, message: data.error || "Generation failed." });
      }
    } catch {
      setGenerationProgress({ total: 0, done: 0, message: "An error occurred. Please try again." });
    } finally {
      setWizardGenerating(false);
    }
  };

  const handleWizardDone = () => {
    const campaignId = wizardCampaignId;
    closeWizard();
    if (campaignId) {
      router.push(`/dashboard/campaigns/${campaignId}`);
    } else {
      fetchCampaigns();
    }
  };

  // ─── Campaign actions ─────────────────────────────────────────────────────
  const handleDelete = async (force: boolean = false) => {
    if (!deleteModalId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${deleteModalId}${force ? '?force=true' : ''}`, { 
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) { setDeleteModalId(null); fetchCampaigns(); }
      else { const d = await res.json(); alert(d.error || "Failed to delete campaign."); }
    } catch { alert("An error occurred."); }
    finally { setDeleting(false); }
  };

  const handleGenerateEmails = async (id: string) => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/generate-email-sequence`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true })
      });
      const data = await res.json();
      if (res.ok) {
        const msg = data.message || "Emails generated successfully! Open the campaign to review them.";
        alert(msg);
        fetchCampaigns();
      } else {
        alert(data.error || "Failed to generate emails.");
      }
    } catch { alert("An error occurred."); }
    finally { setGenerating(false); setGenerateModalId(null); }
  };

  const handleStartCampaign = async (id: string) => {
    setStarting(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStartConfirmId(null);
        fetchCampaigns();
        if (data.email1Sent) {
          alert("Campaign started! Email 1 was sent immediately. Follow-ups are scheduled.");
        } else if (data.email1Queued) {
          alert("Campaign started! Email 1 is queued to send immediately. Follow-ups are scheduled.");
        } else {
          alert(`Campaign started! ${data.scheduled || 0} emails have been scheduled.`);
        }
      } else {
        setStartConfirmId(null);
        if (data.error) {
          const missing = data.missingRequirements || data.missing;
          if (missing && missing.length > 0) {
            alert(`Failed to start campaign. Missing Requirements:\n\n- ${missing.join('\n- ')}`);
          } else {
            alert(data.error);
          }
        } else {
          setReadinessModal({ open: true, campaignId: id, items: data.items || [] });
        }
      }
    } catch { alert("An error occurred while starting the campaign."); }
    finally { setStarting(false); }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}/pause`, { 
        method: "POST",
        credentials: "include" 
      });
      if (res.ok) fetchCampaigns();
      else { const d = await res.json(); alert(d.error || "Failed to pause campaign."); }
    } catch { alert("An error occurred."); }
  };

  const handleResumeCampaign = (id: string) => setStartConfirmId(id);

  const handleSaveEditCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCampaign) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${editCampaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editCampaign)
      });
      if (res.ok) { setEditModalOpen(false); fetchCampaigns(); }
      else { const d = await res.json(); alert(d.error || "Failed to save changes."); }
    } catch { alert("An error occurred."); }
    finally { setEditSaving(false); }
  };

  // ─── Email actions ────────────────────────────────────────────────────────
  const handleApproveEmail = async (id: string) => {
    if (!id) { alert("Email draft ID is missing. Please refresh and try again."); return; }
    try {
      const res = await fetch(`/api/email-sequences/${id}/approve`, { method: "POST" });
      if (res.ok) fetchEmails();
      else { const d = await res.json(); alert(d.error || "Failed to approve email."); }
    } catch { alert("An error occurred."); }
  };

  const handleRejectEmail = async (id: string) => {
    if (!id) { alert("Email draft ID is missing. Please refresh and try again."); return; }
    try {
      const res = await fetch(`/api/email-sequences/${id}/reject`, { method: "POST" });
      if (res.ok) fetchEmails();
      else { const d = await res.json(); alert(d.error || "Failed to reject email."); }
    } catch { alert("An error occurred."); }
  };

  const handleDeleteEmail = async (id: string) => {
    if (!id) { alert("Email draft ID is missing. Please refresh and try again."); return; }
    const confirmed = window.confirm("Are you sure you want to delete this email review? This cannot be undone.");
    if (!confirmed) return;
    setDeletingEmailId(id);
    try {
      const res = await fetch(`/api/email-sequences/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        setPendingEmails(prev => prev.filter(e => e.id !== id));
        setSelectedEmailIds(prev => prev.filter(sid => sid !== id));
        fetchCampaigns();
      } else {
        alert(data.error || "Failed to delete email review.");
      }
    } catch { alert("An error occurred while deleting."); }
    finally { setDeletingEmailId(null); }
  };

  const handleSaveEditEmail = async (approve: boolean) => {
    if (!editEmailModal.email || !editEmailModal.email.id) {
      alert("Email draft ID is missing. Please refresh and try again.");
      return;
    }
    if (!editSubject.trim()) { alert("Subject cannot be empty."); return; }
    if (!editBody.trim()) { alert("Body cannot be empty."); return; }
    setEmailSaving(true);
    try {
      const res = await fetch(`/api/email-sequences/${editEmailModal.email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody, approve })
      });
      if (res.ok) {
        setEditEmailModal({ open: false, email: null });
        fetchEmails();
      } else { const d = await res.json(); alert(d.error || "Failed to save changes."); }
    } catch { alert("An error occurred."); }
    finally { setEmailSaving(false); }
  };

  const handleRegenerateEmail = async () => {
    if (!regenModal.email || !regenModal.email.id) {
      alert("Email draft ID is missing. Please refresh and try again.");
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/email-sequences/${regenModal.email.id}/regenerate`, { method: "POST" });
      if (res.ok) { setRegenModal({ open: false, email: null }); fetchEmails(); }
      else { const d = await res.json(); alert(d.error || "Failed to regenerate email."); }
    } catch { alert("An error occurred."); }
    finally { setRegenerating(false); }
  };

  const handleBulkConfirm = async () => {
    if (!bulkModal) return;
    
    const validIds = selectedEmailIds.filter(Boolean);
    if (validIds.length === 0) {
      alert("Select drafts first.");
      return;
    }

    setBulkProcessing(true);
    let approved = 0, skipped = 0, errors = 0;
    try {
      for (const id of validIds) {
        try {
          let res: Response;
          if (bulkModal.action === "approve") {
            res = await fetch(`/api/email-sequences/${id}/approve`, { method: "POST" });
          } else if (bulkModal.action === "reject") {
            res = await fetch(`/api/email-sequences/${id}/reject`, { method: "POST" });
          } else {
            res = await fetch(`/api/email-sequences/${id}/regenerate`, { method: "POST" });
          }
          if (res.ok) approved++;
          else skipped++;
        } catch { errors++; }
      }
      setBulkModal(null);
      setSelectedEmailIds([]);
      fetchEmails();
      alert(`Done: ${approved} ${bulkModal.action}d, ${skipped} skipped, ${errors} errors.`);
    } catch { alert("An error occurred during bulk action."); }
    finally { setBulkProcessing(false); }
  };

  // ─── Filters ──────────────────────────────────────────────────────────────
  const filteredCampaigns = campaigns.filter(c => {
    if (campaignFilter !== "All" && c.status !== campaignFilter) return false;
    if (campaignSearch) {
      const t = campaignSearch.toLowerCase();
      return c.name?.toLowerCase().includes(t) || c.targetAudience?.toLowerCase().includes(t) || c.campaignType?.toLowerCase().includes(t);
    }
    return true;
  });

  const validLeads = wizardLeads.filter(l => l.email && l.email.includes("@") && l.status !== "Unsubscribed");
  const invalidLeads = wizardLeads.filter(l => !l.email || !l.email.includes("@"));
  const unsubscribedLeads = wizardLeads.filter(l => l.status === "Unsubscribed");
  const filteredWizardLeads = validLeads.filter(l =>
    !wizardLeadSearch || l.businessName.toLowerCase().includes(wizardLeadSearch.toLowerCase()) || (l.email || "").toLowerCase().includes(wizardLeadSearch.toLowerCase())
  );

  const activeSteps = wizardData.sequenceSteps.filter(s => s.enabled).length;
  const totalDraftCount = selectedLeadIds.length * activeSteps;

  // ─── Render ───────────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Your session expired</h2>
        <p className="text-slate-400 mb-6 max-w-md">Please log in again to access the AI Email Agent and manage your campaigns.</p>
        <Link href="/login" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold text-white">AI Email Agent</h2>
          </div>
          <p className="text-slate-400 max-w-2xl">Create campaigns, select leads, generate AI email drafts, review them, and launch safely. Nothing sends without your approval.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/campaigns" id="btn-view-campaigns" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700 text-sm">
            View All Campaigns
          </Link>
          <button id="btn-create-campaign" onClick={openWizard} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-500/25 text-sm">
            <Plus size={16} /> Create Campaign
          </button>
        </div>
      </div>

      {/* ══════════════════════ CAMPAIGN HUB ══════════════════════ */}
      <div className="space-y-4">
          {/* Search + filter bar */}
          <div className="flex flex-col md:flex-row justify-between gap-3">
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full md:w-72">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input type="text" value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)}
                placeholder="Search campaigns..." className="bg-transparent border-none outline-none ml-2 w-full text-sm text-white placeholder-slate-500" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {["All", "Draft", "Pending Review", "Active", "Paused", "Completed"].map(f => (
                <button key={f} onClick={() => setCampaignFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${campaignFilter === f ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign cards */}
          {fetchingCampaigns ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 animate-pulse">
                  <div className="h-5 bg-slate-800 rounded w-48 mb-3"></div>
                  <div className="h-3 bg-slate-800 rounded w-64 mb-2"></div>
                  <div className="h-3 bg-slate-800 rounded w-32"></div>
                </div>
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-5 border border-purple-500/20">
                <Target size={36} className="text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No campaigns yet</h3>
              <p className="text-slate-400 max-w-sm mb-6">Create your first client outreach campaign.</p>
              <button onClick={openWizard} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors">
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredCampaigns.map(camp => {
                const nextAction = getNextAction(camp);
                const leads = camp._count?.campaignLeads ?? camp._count?.leads ?? 0;
                return (
                  <div key={camp.id} className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 hover:border-purple-500/30 transition-all">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <Link href={`/dashboard/campaigns/${camp.id}`} className="font-bold text-white text-base truncate hover:text-purple-400 transition-colors" title="Open campaign details">
                            {camp.name}
                          </Link>
                          <StatusBadge status={camp.status} />
                          <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{camp.campaignType || "Outreach"}</span>
                        </div>
                        <p className="text-sm text-slate-400 truncate mb-2">{camp.targetAudience || "Target audience not set"} • {camp.offer || "No offer set"}</p>
                        {/* Stats row */}
                        <div className="flex items-center gap-5 text-xs flex-wrap">
                          <div className="flex items-center gap-1 text-slate-400">
                            <Users size={12} className="text-slate-500" />
                            <span className="font-medium text-slate-200">{leads}</span> leads
                          </div>
                          <div className="flex items-center gap-1 text-slate-400">
                            <Mail size={12} className="text-slate-500" />
                            <span className="font-medium text-slate-200">{camp.totalDrafts ?? 0}</span> drafts
                          </div>
                          {(camp.pendingReview ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-amber-400">
                              <AlertCircle size={12} />
                              <span className="font-medium">{camp.pendingReview}</span> pending review
                            </div>
                          )}
                          {(camp.approvedEmail1 ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCircle2 size={12} />
                              <span className="font-medium">{camp.approvedEmail1}</span> Email 1 approved
                            </div>
                          )}
                          {(camp._count?.replies ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-blue-400">
                              <MessageSquare size={12} />
                              <span className="font-medium">{camp._count?.replies}</span> replies
                            </div>
                          )}
                        </div>
                        {/* Next action */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="text-xs text-slate-500">Next:</span>
                          <button
                            id={`btn-next-action-${camp.id}`}
                            onClick={() => {
                              if (nextAction.action === "start") setStartConfirmId(camp.id);
                              else if (nextAction.action === "resume") handleResumeCampaign(camp.id);
                              else if (nextAction.action === "generate") setGenerateModalId(camp.id);
                              else if (nextAction.action === "review") router.push(`/dashboard/campaigns/${camp.id}`);
                              else if (nextAction.action === "edit") { setEditCampaign(camp); setEditModalOpen(true); }
                              else if (nextAction.action === "settings") { window.location.href = "/dashboard/settings"; }
                              else if (nextAction.action === "replies") { window.location.href = "/dashboard/replies"; }
                              else if (nextAction.action === "addLeads") router.push(`/dashboard/campaigns/${camp.id}`);
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors">
                            <ArrowRight size={12} /> {nextAction.label}
                          </button>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap lg:flex-nowrap shrink-0">
                        {camp.status !== "Active" ? (
                          <button id={`btn-start-${camp.id}`} onClick={() => setStartConfirmId(camp.id)}
                            className="px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/20 border border-green-500/20 flex items-center gap-1">
                            <Play size={13} /> Start
                          </button>
                        ) : (
                          <button id={`btn-pause-${camp.id}`} onClick={() => handlePauseCampaign(camp.id)}
                            className="px-3 py-1.5 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-lg hover:bg-yellow-500/20 border border-yellow-500/20 flex items-center gap-1">
                            <Pause size={13} /> Pause
                          </button>
                        )}
                        <button id={`btn-generate-${camp.id}`} onClick={() => setGenerateModalId(camp.id)}
                          className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 border border-purple-500/20" title="Generate Emails">
                          <Sparkles size={15} />
                        </button>
                        <button id={`btn-review-${camp.id}`} onClick={() => router.push(`/dashboard/campaigns/${camp.id}`)}
                          className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 border border-blue-500/20" title="Review Emails">
                          <Mail size={15} />
                        </button>
                        <button id={`btn-edit-${camp.id}`} onClick={() => { setEditCampaign(camp); setEditModalOpen(true); }}
                          className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 border border-slate-700" title="Edit Campaign">
                          <Edit2 size={15} />
                        </button>
                        <Link href={`/dashboard/campaigns/${camp.id}`}>
                          <span id={`btn-view-${camp.id}`} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 border border-slate-700 flex" title="View Sequence">
                            <FileText size={15} />
                          </span>
                        </Link>
                        <button id={`btn-delete-${camp.id}`} onClick={() => {
                          setDeleteModalId(camp.id);
                          setDeleteHasSent((camp._count?.emailSequences ?? 0) > 0);
                        }}
                          className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 border border-red-500/20" title="Delete Campaign">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* ══════════════════════ MODALS ══════════════════════ */}

      {/* ── Create Campaign Wizard ── */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
            {/* Wizard header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">Create Campaign</h3>
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3, 4, 5, 6].map(s => (
                    <div key={s} className={`h-1 rounded-full transition-all ${s === wizardStep ? "w-8 bg-purple-500" : s < wizardStep ? "w-4 bg-purple-800" : "w-4 bg-slate-700"}`} />
                  ))}
                </div>
              </div>
              <button onClick={closeWizard} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Wizard body */}
            <div className="overflow-y-auto flex-1 p-6">

              {/* STEP 1 — Campaign Basics */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 1 — Campaign Basics</h4>
                    <p className="text-sm text-slate-400">Tell AI who this campaign is for and what outcome you want.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="Campaign Name" required helper="e.g. Q3 Outreach">
                      <input type="text" value={wizardData.name}
                        onChange={e => setWizardData(d => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Q3 Client Outreach"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Business / Client Name" required helper="The name of the business sending emails">
                      <input type="text" value={wizardData.clientName}
                        onChange={e => setWizardData(d => ({ ...d, clientName: e.target.value }))}
                        placeholder="e.g. Acme Corp"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Industry / Niche" required helper="e.g. Real Estate, SaaS, Coaching">
                      <input type="text" value={wizardData.industry}
                        onChange={e => setWizardData(d => ({ ...d, industry: e.target.value }))}
                        placeholder="e.g. Real Estate"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Target Location" helper="e.g. United States, Florida, Global">
                      <input type="text" value={wizardData.targetLocation}
                        onChange={e => setWizardData(d => ({ ...d, targetLocation: e.target.value }))}
                        placeholder="e.g. United States"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Campaign Type">
                      <select value={wizardData.campaignType} onChange={e => setWizardData(d => ({ ...d, campaignType: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm">
                        {["Client Outreach", "Sales Outreach", "Follow-up", "Re-Engagement", "Other"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </InputField>
                    <InputField label="Campaign Goal" helper="What do you want to achieve?">
                      <input type="text" value={wizardData.goal}
                        onChange={e => setWizardData(d => ({ ...d, goal: e.target.value }))}
                        placeholder="e.g. Book discovery calls"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Language">
                      <select value={wizardData.language} onChange={e => setWizardData(d => ({ ...d, language: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm">
                        {["English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Chinese", "Japanese", "Arabic", "Hindi", "Korean", "Turkish"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </InputField>
                  </div>
                </div>
              )}

              {/* STEP 2 — Select Leads */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 2 — Select Leads</h4>
                    <p className="text-sm text-slate-400">Choose leads that should receive this campaign. Leads without valid emails are skipped.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <div className="text-2xl font-bold text-green-400">{validLeads.length}</div>
                      <div className="text-slate-400 mt-0.5">Valid email leads</div>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <div className="text-2xl font-bold text-amber-400">{invalidLeads.length}</div>
                      <div className="text-slate-400 mt-0.5">No valid email</div>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                      <div className="text-2xl font-bold text-slate-400">{unsubscribedLeads.length}</div>
                      <div className="text-slate-400 mt-0.5">Unsubscribed</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex-1">
                      <Search size={13} className="text-slate-400" />
                      <input type="text" value={wizardLeadSearch} onChange={e => setWizardLeadSearch(e.target.value)}
                        placeholder="Search leads..." className="bg-transparent border-none outline-none ml-2 text-sm text-white w-full" />
                    </div>
                    <button onClick={() => setSelectedLeadIds(filteredWizardLeads.map(l => l.id))}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg">
                      Select All Valid
                    </button>
                    <button onClick={() => setSelectedLeadIds([])}
                      className="px-3 py-2 bg-slate-700 text-slate-300 text-xs rounded-lg">
                      Clear
                    </button>
                  </div>
                  <div className="text-sm text-slate-400">
                    <span className="text-purple-400 font-medium">{selectedLeadIds.length}</span> leads selected
                  </div>
                  {wizardLeadsLoading ? (
                    <div className="text-center py-8 text-slate-500">Loading leads...</div>
                  ) : validLeads.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="text-slate-500 mb-3">No valid leads found</div>
                      <Link href="/dashboard/generate-leads">
                        <span className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Generate Leads First</span>
                      </Link>
                    </div>
                  ) : (
                    <div className="border border-slate-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                      {filteredWizardLeads.slice(0, 100).map(lead => (
                        <label key={lead.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 cursor-pointer border-b border-slate-800 last:border-0">
                          <input type="checkbox" checked={selectedLeadIds.includes(lead.id)}
                            onChange={() => setSelectedLeadIds(prev => prev.includes(lead.id) ? prev.filter(i => i !== lead.id) : [...prev, lead.id])}
                            className="w-4 h-4 rounded" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{lead.businessName}</div>
                            <div className="text-xs text-slate-500 truncate">{lead.email} · {lead.category || "Unknown category"}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3 — Offer and CTA */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 3 — Offer and CTA</h4>
                    <p className="text-sm text-slate-400">Give AI your offer and CTA. AI will not invent proof or fake results.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="Target Audience" helper="Who exactly is this campaign for?">
                      <input type="text" value={wizardData.targetAudience}
                        onChange={e => setWizardData(d => ({ ...d, targetAudience: e.target.value }))}
                        placeholder="e.g. Small business owners in USA"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Offer / Service / Product">
                      <input type="text" value={wizardData.offer}
                        onChange={e => setWizardData(d => ({ ...d, offer: e.target.value }))}
                        placeholder="e.g. AI automation for customer service"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="What problem do you solve?">
                      <input type="text" value={wizardData.problemSolved}
                        onChange={e => setWizardData(d => ({ ...d, problemSolved: e.target.value }))}
                        placeholder="e.g. Too much time spent on manual follow-ups"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Desired Result">
                      <input type="text" value={wizardData.desiredOutcome}
                        onChange={e => setWizardData(d => ({ ...d, desiredOutcome: e.target.value }))}
                        placeholder="e.g. Save 10 hours a week and boost sales by 20%"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Why should they trust you?">
                      <input type="text" value={wizardData.trustReason}
                        onChange={e => setWizardData(d => ({ ...d, trustReason: e.target.value }))}
                        placeholder="e.g. We have 10 years of industry experience"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Proof / Case Study" helper="Optional. AI will NOT invent proof if left empty." >
                      <input type="text" value={wizardData.proofCaseStudy}
                        onChange={e => setWizardData(d => ({ ...d, proofCaseStudy: e.target.value }))}
                        placeholder="e.g. Helped TechCorp grow by 30% in 2 months"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Main CTA">
                      <input type="text" value={wizardData.callToAction}
                        onChange={e => setWizardData(d => ({ ...d, callToAction: e.target.value }))}
                        placeholder="e.g. Book a 15-minute strategy call"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Common Objections" helper="Optional.">
                      <input type="text" value={wizardData.commonObjections}
                        onChange={e => setWizardData(d => ({ ...d, commonObjections: e.target.value }))}
                        placeholder="e.g. We don't have budget, we already use a solution"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Do Not Mention" helper="Optional. Topics AI should avoid.">
                      <input type="text" value={wizardData.doNotMention}
                        onChange={e => setWizardData(d => ({ ...d, doNotMention: e.target.value }))}
                        placeholder="e.g. Don't mention pricing upfront"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Booking Link" required helper="Required before campaign can start">
                      <input type="url" value={wizardData.bookingLink}
                        onChange={e => setWizardData(d => ({ ...d, bookingLink: e.target.value }))}
                        placeholder="https://calendly.com/yourname"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                    <InputField label="Unsubscribe Line" required helper="Required before campaign can start">
                      <input type="text" value={wizardData.unsubscribeLine}
                        onChange={e => setWizardData(d => ({ ...d, unsubscribeLine: e.target.value }))}
                        placeholder="Reply STOP to unsubscribe"
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </InputField>
                  </div>
                </div>
              )}

              {/* STEP 4 — Email Sequence */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 4 — Email Sequence</h4>
                    <p className="text-sm text-slate-400">Choose how many follow-ups AI should create. You can disable any step.</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-sm text-purple-300">
                    <strong>{selectedLeadIds.length} leads</strong> × <strong>{activeSteps} emails</strong> = <strong>{totalDraftCount} total drafts</strong> will be created
                  </div>
                  <div className="space-y-2">
                    {wizardData.sequenceSteps.map((step, idx) => (
                      <div key={step.step} className={`border rounded-xl p-4 transition-all ${step.enabled ? "border-slate-700 bg-slate-800/30" : "border-slate-800 bg-slate-900/30 opacity-50"}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={step.enabled}
                            onChange={() => setWizardData(d => ({
                              ...d,
                              sequenceSteps: d.sequenceSteps.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s)
                            }))}
                            className="w-4 h-4 rounded" />
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">Email {step.step}</span>
                              <span className="text-sm font-medium text-white">{step.name}</span>
                              <span className="text-xs text-slate-500">Day {step.delayDays}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{step.purpose}</p>
                          </div>
                          <div className="text-xs text-slate-500">
                            <input type="number" value={step.delayDays} min={idx === 0 ? 0 : 1}
                              onChange={e => setWizardData(d => ({
                                ...d,
                                sequenceSteps: d.sequenceSteps.map((s, i) => i === idx ? { ...s, delayDays: parseInt(e.target.value) || 0 } : s)
                              }))}
                              className="w-16 text-center px-2 py-1 rounded-lg text-xs"
                              disabled={idx === 0} />
                            <span className="ml-1">days</span>
                          </div>
                        </div>
                        {step.enabled && (
                          <input type="text" value={step.extraInstruction}
                            onChange={e => setWizardData(d => ({
                              ...d,
                              sequenceSteps: d.sequenceSteps.map((s, i) => i === idx ? { ...s, extraInstruction: e.target.value } : s)
                            }))}
                            placeholder="Extra instruction for AI (optional)"
                            className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs" />
                        )}
                      </div>
                    ))}
                  </div>
                  {activeSteps === 0 && (
                    <div className="text-amber-400 text-sm flex items-center gap-2">
                      <AlertTriangle size={14} /> At least one email step must be enabled.
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5 — AI Writing Style */}
              {wizardStep === 5 && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 5 — AI Writing Style</h4>
                    <p className="text-sm text-slate-400">Control how the emails should sound and feel.</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { label: "Personalization Level", key: "personalizationLevel", options: ["Low", "Medium", "High"] },
                      { label: "Email Length", key: "emailLength", options: ["Very Short", "Short", "Detailed", "Big"] },
                      { label: "Spam Safety", key: "spamSafety", options: ["Normal", "High"] },
                      { label: "CTA Style", key: "ctaStyle", options: ["Soft", "Direct"] },
                      { label: "Tone", key: "tone", options: ["Professional", "Friendly", "Confident", "Consultative"] },
                    ].map(({ label, key, options }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                        <select value={(wizardData as any)[key]} onChange={e => setWizardData(d => ({ ...d, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm">
                          {options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Daily Sending Limit</label>
                      <input type="number" value={wizardData.dailyLimit} min={1}
                        onChange={e => setWizardData(d => ({ ...d, dailyLimit: parseInt(e.target.value) || 50 }))}
                        className="w-full px-3 py-2 rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6 — Review and Generate */}
              {wizardStep === 6 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-white mb-1">Step 6 — Review and Generate</h4>
                    <p className="text-sm text-slate-400">Review everything before AI creates your drafts. Nothing will be sent yet.</p>
                  </div>
                  {generationProgress ? (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-xl border ${generationProgress.total === 0 ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"}`}>
                        <p className="text-sm font-medium text-white">{generationProgress.message}</p>
                      </div>
                      {generationProgress.done > 0 && (
                        <div className="text-sm text-slate-400">
                          <p>✓ <span className="text-green-400">{generationProgress.done * 5}</span> drafts created for <span className="text-green-400">{generationProgress.done}</span> leads.</p>
                          <p className="mt-1">Open the campaign details to review and approve Email 1 before starting the campaign.</p>
                        </div>
                      )}
                      <button onClick={handleWizardDone}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                        <ArrowRight size={16} /> Go to Campaign Details
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                          ["Campaign", wizardData.name], ["Goal", wizardData.goal || "—"],
                          ["Leads selected", String(selectedLeadIds.length)],
                          ["Emails per lead", String(activeSteps)],
                          ["Total drafts", String(totalDraftCount)],
                          ["Sender email", wizardData.senderEmail || "Not set"],
                          ["Booking link", wizardData.bookingLink ? "✓ Set" : "⚠ Not set"],
                          ["Unsubscribe line", wizardData.unsubscribeLine ? "✓ Set" : "⚠ Not set"],
                          ["AI tone", wizardData.tone], ["Personalization", wizardData.personalizationLevel],
                          ["Email length", wizardData.emailLength], ["Spam safety", wizardData.spamSafety],
                        ].map(([label, val]) => (
                          <div key={label} className="flex justify-between gap-2 py-1.5 border-b border-slate-800">
                            <span className="text-slate-500 text-xs">{label}</span>
                            <span className={`text-xs font-medium text-right ${val?.startsWith("⚠") ? "text-amber-400" : "text-white"}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-300 flex items-start gap-2">
                        <Info size={15} className="mt-0.5 shrink-0" />
                        <span>AI will create drafts only. <strong>Nothing will be sent yet.</strong> You must review and approve Email 1 before starting the campaign.</span>
                      </div>
                      <button id="btn-wizard-generate" onClick={handleWizardGenerate} disabled={wizardGenerating || activeSteps === 0 || selectedLeadIds.length === 0}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {wizardGenerating ? <><Loader2 size={17} className="animate-spin" /> Generating AI Drafts...</> : <><Sparkles size={17} /> Create Campaign & Generate AI Emails</>}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Wizard footer */}
            {!(wizardStep === 6 && generationProgress) && (
              <div className="p-5 border-t border-slate-800 flex justify-between items-center shrink-0 bg-slate-900/50">
                <button onClick={() => wizardStep > 1 ? setWizardStep(s => s - 1) : closeWizard()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm flex items-center gap-1">
                  <ChevronLeft size={15} /> {wizardStep > 1 ? "Back" : "Cancel"}
                </button>
                {wizardStep < 6 && (
                  <button onClick={handleWizardNext} disabled={wizardSaving || (wizardStep === 4 && activeSteps === 0)}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium flex items-center gap-1 disabled:opacity-50">
                    {wizardSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                    Next <ChevronRight size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Campaign Modal ── */}
      {editModalOpen && editCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-xl shadow-2xl" style={{ maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-white">Edit Campaign</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEditCampaign} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                <InputField label="Campaign Name" required>
                  <input type="text" required value={editCampaign.name} onChange={e => setEditCampaign(c => c ? { ...c, name: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Target Audience">
                  <input type="text" value={editCampaign.targetAudience || ""} onChange={e => setEditCampaign(c => c ? { ...c, targetAudience: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Offer">
                  <input type="text" value={editCampaign.offer || ""} onChange={e => setEditCampaign(c => c ? { ...c, offer: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Booking Link" helper="Required to start campaign">
                  <input type="url" value={editCampaign.bookingLink || editCampaign.ctaLink || ""} onChange={e => setEditCampaign(c => c ? { ...c, bookingLink: e.target.value, ctaLink: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Unsubscribe Line" helper="Required to start campaign">
                  <input type="text" value={editCampaign.unsubscribeLine || ""} onChange={e => setEditCampaign(c => c ? { ...c, unsubscribeLine: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Sender Email">
                  <input type="email" value={editCampaign.senderEmail || ""} onChange={e => setEditCampaign(c => c ? { ...c, senderEmail: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Problem Solved">
                  <input type="text" value={editCampaign.problemSolved || ""} onChange={e => setEditCampaign(c => c ? { ...c, problemSolved: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Proof / Case Study" helper="Leave empty and AI won't invent proof">
                  <input type="text" value={editCampaign.proofCaseStudy || ""} onChange={e => setEditCampaign(c => c ? { ...c, proofCaseStudy: e.target.value } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
                <InputField label="Daily Sending Limit">
                  <input type="number" value={editCampaign.dailyLimit || 50} min={1} onChange={e => setEditCampaign(c => c ? { ...c, dailyLimit: parseInt(e.target.value) } : c)} className="w-full px-3 py-2 rounded-xl text-sm" />
                </InputField>
              </div>
              <div className="p-5 border-t border-slate-800 flex justify-end gap-3 shrink-0 bg-slate-900/50">
                <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
                <button type="submit" disabled={editSaving} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                  {editSaving && <Loader2 size={14} className="animate-spin" />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Campaign</h3>
            </div>
            <p className="text-slate-400 text-sm">Are you sure you want to delete this campaign?</p>
            {deleteHasSent && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-300 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> This campaign has email history. It will be archived instead of deleted.
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteModalId(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
              {deleteHasSent && (
                <button onClick={() => handleDelete(true)} disabled={deleting}
                  className="px-5 py-2 bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-500/30 rounded-xl text-sm font-medium transition-colors">
                  Force Delete
                </button>
              )}
              <button id="btn-confirm-delete" onClick={() => handleDelete(false)} disabled={deleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                {deleting && <Loader2 size={14} className="animate-spin" />} {deleteHasSent ? "Archive" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Emails Confirm Modal ── */}
      {generateModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border-2 border-transparent bg-clip-padding rounded-2xl w-full max-w-3xl p-8 space-y-6 relative overflow-hidden shadow-[0_0_40px_rgba(124,58,237,0.5)]">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-[2px] -z-10 rounded-2xl" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center">
                <Sparkles size={24} className="text-purple-400" />
              </div>
              <h3 className="text-2xl font-bold text-white">Generate AI Emails</h3>
            </div>
            <p className="text-slate-300 text-lg">AI will create email drafts for all leads in this campaign. Leads that already have drafts will be skipped.</p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-base text-blue-300 flex items-start gap-3">
              <Info size={18} className="mt-1 shrink-0" /> Nothing will be sent. Drafts require your review and approval first.
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <button onClick={() => setGenerateModalId(null)} className="whitespace-nowrap px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-base font-medium transition-colors">Cancel</button>
              <button onClick={() => alert("Generate Full 5-Step Sequence will be available after preview.")} className="whitespace-nowrap px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-base font-medium transition-colors">
                Generate Full 5-Step Sequence
              </button>
              <button id="btn-confirm-generate" onClick={() => handleGenerateEmails(generateModalId!)} disabled={generating}
                className="whitespace-nowrap px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 transition-all hover:scale-105">
                {generating && <Loader2 size={18} className="animate-spin" />} Generate Preview Sequence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start Confirm Modal ── */}
      {startConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                <Play size={18} className="text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Start this campaign?</h3>
            </div>
            <ul className="text-sm text-slate-400 space-y-2">
              <li className="flex items-start gap-2"><Check size={14} className="text-green-400 mt-0.5 shrink-0" /> Only <strong className="text-green-400">Approved</strong> emails will be scheduled.</li>
              <li className="flex items-start gap-2"><X size={14} className="text-amber-400 mt-0.5 shrink-0" /> Pending or Rejected emails will not be sent.</li>
              <li className="flex items-start gap-2"><Shield size={14} className="text-blue-400 mt-0.5 shrink-0" /> Follow-ups stop when a lead replies, unsubscribes, bounces, or books a call.</li>
            </ul>
            <div className="flex justify-end gap-3 pt-2">
              <button id="btn-cancel-start" onClick={() => setStartConfirmId(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
              <button id="btn-confirm-start" onClick={() => handleStartCampaign(startConfirmId!)} disabled={starting}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                {starting && <Loader2 size={14} className="animate-spin" />} <Check size={14} /> Start Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Readiness Checklist Modal ── */}
      {readinessModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-400" />
                <h3 className="text-lg font-bold text-white">Campaign Not Ready</h3>
              </div>
              <button onClick={() => setReadinessModal({ open: false, campaignId: null, items: [] })} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              <p className="text-sm text-slate-400">Complete the missing items below before starting this campaign.</p>
              {readinessModal.items.map(item => (
                <div key={item.key} className={`flex items-center gap-3 p-4 rounded-xl border ${item.passed ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.passed ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {item.passed ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${item.passed ? "text-slate-300" : "text-white"}`}>{item.label}</div>
                    {!item.passed && <div className="text-xs text-slate-500 mt-0.5">{item.actionHint}</div>}
                  </div>
                  {!item.passed && (
                    <button onClick={() => {
                      if (item.key === "senderEmail") window.location.href = "/dashboard/settings";
                      else if (item.key === "email1Generated" && readinessModal.campaignId) setGenerateModalId(readinessModal.campaignId);
                      else if (item.key === "email1Approved" && readinessModal.campaignId) {
                        router.push(`/dashboard/campaigns/${readinessModal.campaignId}`);
                        setReadinessModal(s => ({ ...s, open: false }));
                      }
                      else if (["bookingLink", "unsubscribeLine"].includes(item.key)) {
                        const camp = campaigns.find(c => c.id === readinessModal.campaignId);
                        if (camp) { setEditCampaign(camp); setEditModalOpen(true); }
                        setReadinessModal(s => ({ ...s, open: false }));
                      }
                    }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg border border-slate-700 whitespace-nowrap">
                      Fix →
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/20 shrink-0">
              <button onClick={() => setReadinessModal({ open: false, campaignId: null, items: [] })} className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm">Close</button>
              <button id="btn-retry-start" onClick={() => { if (readinessModal.campaignId) { setStartConfirmId(readinessModal.campaignId); setReadinessModal({ open: false, campaignId: null, items: [] }); } }}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                <RefreshCw size={14} /> Retry Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Email Modal ── */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
            <div className="p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">Email Preview</h3>
                <p className="text-xs text-slate-500 mt-0.5">{previewEmail.campaign?.name} · Step {previewEmail.sequenceStep} · {previewEmail.lead?.businessName}</p>
              </div>
              <button onClick={() => setPreviewEmail(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Warnings */}
              {previewEmail.personalizationScore != null && previewEmail.personalizationScore < 50 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-300 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> This email has low personalization because lead data is limited.
                </div>
              )}
              {previewEmail.spamRisk === "High" && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> This email may sound too promotional. Please edit before approving.
                </div>
              )}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Subject</span>
                  <p className="text-white font-medium mt-1">{previewEmail.editedSubject || previewEmail.subject}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Body</span>
                  <p className="text-slate-300 text-sm mt-1 whitespace-pre-wrap leading-relaxed">{previewEmail.editedBody || previewEmail.body}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-800/30 rounded-xl p-3">
                  <span className="text-xs text-slate-500">Lead</span>
                  <p className="text-white font-medium">{previewEmail.lead?.businessName}</p>
                  <p className="text-slate-400 text-xs">{previewEmail.lead?.email}</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-3">
                  <span className="text-xs text-slate-500">Scores</span>
                  <p className="text-white font-medium">{previewEmail.personalizationScore ?? "N/A"}% personalized</p>
                  <p className={`text-xs ${previewEmail.spamRisk === "High" ? "text-red-400" : previewEmail.spamRisk === "Medium" ? "text-amber-400" : "text-green-400"}`}>
                    Spam risk: {previewEmail.spamRisk || "Low"}
                  </p>
                </div>
              </div>
              {previewEmail.aiGenerationReason && (
                <div className="bg-slate-800/30 rounded-xl p-3 text-sm">
                  <span className="text-xs text-slate-500">AI Personalization Reason</span>
                  <p className="text-slate-300 mt-1">{previewEmail.aiGenerationReason}</p>
                </div>
              )}
              {previewEmail.aiOriginalSubject && previewEmail.editedSubject && (
                <div className="bg-slate-800/30 rounded-xl p-3 text-sm">
                  <span className="text-xs text-slate-500">Original AI Subject</span>
                  <p className="text-slate-400 mt-1 line-through">{previewEmail.aiOriginalSubject}</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-800 flex justify-end gap-3 shrink-0 bg-slate-900/50">
              <button onClick={() => setPreviewEmail(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Close</button>
              <button onClick={() => {
                setEditSubject(previewEmail.editedSubject || previewEmail.subject);
                setEditBody(previewEmail.editedBody || previewEmail.body);
                setEditEmailModal({ open: true, email: previewEmail });
                setPreviewEmail(null);
              }} className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-sm flex items-center gap-1">
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => { handleApproveEmail(previewEmail.id); setPreviewEmail(null); }}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm flex items-center gap-1">
                <Check size={14} /> Approve
              </button>
              {previewEmail.status !== "Sent" && (
                <button onClick={() => { handleDeleteEmail(previewEmail.id); setPreviewEmail(null); }}
                  className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white rounded-xl text-sm flex items-center gap-1 transition-colors">
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Email Modal ── */}
      {editEmailModal.open && editEmailModal.email && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
            <div className="p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Email Draft</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editEmailModal.email.campaign?.name} · Step {editEmailModal.email.sequenceStep} · {editEmailModal.email.lead?.businessName}</p>
              </div>
              <button onClick={() => setEditEmailModal({ open: false, email: null })} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject <span className="text-red-400">*</span></label>
                <input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Body <span className="text-red-400">*</span></label>
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={10}
                  className="w-full px-3 py-2.5 rounded-xl text-sm leading-relaxed resize-none" />
              </div>
              {editEmailModal.email.aiOriginalSubject && (
                <div className="bg-slate-800/30 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Original AI subject:</p>
                  <p className="text-slate-400 text-sm">{editEmailModal.email.aiOriginalSubject}</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-800 flex justify-between items-center shrink-0 bg-slate-900/50">
              <button onClick={() => setEditEmailModal({ open: false, email: null })} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
              <div className="flex gap-2">
                <button id="btn-save-changes" onClick={() => handleSaveEditEmail(false)} disabled={emailSaving}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm flex items-center gap-1">
                  {emailSaving && <Loader2 size={13} className="animate-spin" />} Save Changes
                </button>
                <button id="btn-save-approve" onClick={() => handleSaveEditEmail(true)} disabled={emailSaving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium flex items-center gap-1">
                  {emailSaving && <Loader2 size={13} className="animate-spin" />} <Check size={14} /> Save & Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Regenerate Confirm Modal ── */}
      {regenModal.open && regenModal.email && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                <RefreshCw size={18} className="text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Regenerate this email?</h3>
            </div>
            <p className="text-slate-400 text-sm">This will replace the AI draft using the same campaign and lead details.</p>
            {(regenModal.email.editedSubject || regenModal.email.editedBody) && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-300 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> This email has manual edits. Regenerating will replace them with a new AI version.
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button id="btn-cancel-regen" onClick={() => setRegenModal({ open: false, email: null })} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
              <button id="btn-confirm-regen" onClick={handleRegenerateEmail} disabled={regenerating}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                {regenerating && <Loader2 size={14} className="animate-spin" />} <RefreshCw size={14} /> Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Action Confirm Modal ── */}
      {bulkModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bulkModal.action === "approve" ? "bg-green-500/10" : bulkModal.action === "reject" ? "bg-red-500/10" : "bg-purple-500/10"}`}>
                {bulkModal.action === "approve" ? <Check size={18} className="text-green-400" /> : bulkModal.action === "reject" ? <X size={18} className="text-red-400" /> : <RefreshCw size={18} className="text-purple-400" />}
              </div>
              <h3 className="text-lg font-bold text-white capitalize">Bulk {bulkModal.action}</h3>
            </div>
            <p className="text-slate-400 text-sm">
              You are {bulkModal.action === "approve" ? "approving" : bulkModal.action === "reject" ? "rejecting" : "regenerating"} <strong className="text-white">{bulkModal.count} drafts</strong>.
              {bulkModal.action === "approve" && " Approved drafts may be scheduled when the campaign starts."}
              {" "}Failed or empty drafts will be skipped.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button id="btn-cancel-bulk" onClick={() => setBulkModal(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
              <button id="btn-confirm-bulk" onClick={handleBulkConfirm} disabled={bulkProcessing}
                className={`px-5 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2 ${bulkModal.action === "approve" ? "bg-green-600 hover:bg-green-500" : bulkModal.action === "reject" ? "bg-red-600 hover:bg-red-500" : "bg-purple-600 hover:bg-purple-500"}`}>
                {bulkProcessing && <Loader2 size={14} className="animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
