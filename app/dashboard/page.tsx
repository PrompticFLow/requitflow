"use client";
import {
  Users,
  Send,
  MessageSquare,
  Calendar,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ExternalLink,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";

type HistoryItem = {
  type: "email" | "reply" | "meeting" | "created";
  label: string;
  at: string;
};

type CompanyRow = {
  id: string;
  businessName: string;
  contactName: string;
  email: string | null;
  status: string;
  leadTier: string;
  campaignId: string | null;
  campaignName: string | null;
  lastActivity: { label: string; at: string | null };
  history?: HistoryItem[];
};

type Stats = {
  companiesFound: number;
  emailsSent: number;
  repliesReceived: number;
  meetingsBooked: number;
  companies: CompanyRow[];
  funnel: { companies: number; emailsSent: number; replies: number; meetings: number };
  trend: Array<{ date: string; emailsSent: number; replies: number }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
] as const;

function stageBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes("book")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s.includes("replied") || s.includes("interested"))
    return "bg-pink-500/15 text-pink-400 border-pink-500/30";
  if (s.includes("email") || s.includes("campaign") || s.includes("contact"))
    return "bg-violet-500/15 text-violet-400 border-violet-500/30";
  if (s.includes("bounc") || s.includes("unsub") || s.includes("not interested"))
    return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

function historyDot(type: HistoryItem["type"]) {
  switch (type) {
    case "meeting":
      return "bg-emerald-400";
    case "reply":
      return "bg-pink-400";
    case "email":
      return "bg-blue-400";
    default:
      return "bg-slate-500";
  }
}

function shortDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [historyCache, setHistoryCache] = useState<Record<string, HistoryItem[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const initialLoad = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const fetchStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setTableLoading(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        status: filter,
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      const res = await fetch(`/api/dashboard/stats?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          companiesFound: data.companiesFound || 0,
          emailsSent: data.emailsSent || 0,
          repliesReceived: data.repliesReceived || 0,
          meetingsBooked: data.meetingsBooked || data.discoveryCallsBooked || 0,
          companies: data.companies || [],
          funnel: data.funnel || {
            companies: data.companiesFound || 0,
            emailsSent: data.emailsSent || 0,
            replies: data.repliesReceived || 0,
            meetings: data.meetingsBooked || 0,
          },
          trend: data.trend || [],
          pagination: data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        });
      }
    } catch (e) {
      console.error("Failed to fetch pipeline stats", e);
    } finally {
      setLoading(false);
      setTableLoading(false);
      initialLoad.current = false;
    }
  }, [page, filter, debouncedSearch]);

  useEffect(() => {
    fetchStats({ silent: !initialLoad.current });
  }, [fetchStats]);

  const toggle = async (id: string) => {
    const opening = !expanded[id];
    setExpanded((prev) => ({ ...prev, [id]: opening }));
    if (opening && !historyCache[id]) {
      setHistoryLoading((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/dashboard/companies/${id}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistoryCache((prev) => ({ ...prev, [id]: data.history || [] }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setHistoryLoading((prev) => ({ ...prev, [id]: false }));
      }
    }
  };

  const metricCards = [
    {
      label: "Companies found",
      value: stats?.companiesFound ?? 0,
      href: "/dashboard/leads",
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "hover:border-blue-500/50",
    },
    {
      label: "Emails sent",
      value: stats?.emailsSent ?? 0,
      href: "/dashboard/ai-email-agent",
      icon: Send,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "hover:border-violet-500/50",
    },
    {
      label: "Replies",
      value: stats?.repliesReceived ?? 0,
      href: "/dashboard/replies",
      icon: MessageSquare,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "hover:border-pink-500/50",
    },
    {
      label: "Meetings booked",
      value: stats?.meetingsBooked ?? 0,
      href: "/dashboard/booked-calls",
      icon: Calendar,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "hover:border-emerald-500/50",
    },
  ];

  const funnel = stats?.funnel;
  const funnelMax = Math.max(
    funnel?.companies || 0,
    funnel?.emailsSent || 0,
    funnel?.replies || 0,
    funnel?.meetings || 0,
    1
  );
  const trendMax = Math.max(
    1,
    ...(stats?.trend || []).flatMap((t) => [t.emailsSent, t.replies])
  );

  const pagination = stats?.pagination;
  const from =
    pagination && pagination.total > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const to = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Pipeline</h1>
          <p className="text-slate-400">
            Monitor companies, outreach, replies, and booked meetings in one place.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className={`glass p-6 rounded-2xl border border-slate-800 ${m.border} transition-all group`}
          >
            <div className="flex items-center space-x-4">
              <div className={`p-3 ${m.bg} rounded-xl`}>
                <m.icon className={m.color} size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-400">{m.label}</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {loading ? "..." : m.value}
                </h3>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass p-6 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp size={18} className="text-violet-400" />
              <h3 className="text-sm font-semibold text-white">Conversion funnel</h3>
            </div>
            <div className="space-y-4">
              {[
                { label: "Companies", value: funnel?.companies || 0, color: "bg-blue-500" },
                { label: "Emails sent", value: funnel?.emailsSent || 0, color: "bg-violet-500" },
                { label: "Replies", value: funnel?.replies || 0, color: "bg-pink-500" },
                { label: "Meetings", value: funnel?.meetings || 0, color: "bg-emerald-500" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="text-white font-medium">{row.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.color} transition-all duration-500`}
                      style={{ width: `${Math.max(4, (row.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-6 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Last 7 days</h3>
              </div>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-violet-500" /> Emails
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-pink-500" /> Replies
                </span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 h-36">
              {(stats.trend || []).map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-0.5 h-28">
                    <div
                      className="w-[40%] max-w-[14px] rounded-t bg-violet-500/80 min-h-[2px]"
                      style={{ height: `${Math.max(2, (day.emailsSent / trendMax) * 100)}%` }}
                      title={`${day.emailsSent} emails`}
                    />
                    <div
                      className="w-[40%] max-w-[14px] rounded-t bg-pink-500/80 min-h-[2px]"
                      style={{ height: `${Math.max(2, (day.replies / trendMax) * 100)}%` }}
                      title={`${day.replies} replies`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">{shortDay(day.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && stats && stats.companiesFound === 0 ? (
        <div className="glass p-8 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/20">
            <Users className="text-blue-400" size={32} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Get Started</h3>
          <p className="text-slate-400 max-w-md mb-6">
            Start by generating your first list of ideal client leads and launching an
            automated email campaign.
          </p>
          <Link
            href="/dashboard/generate-leads"
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg shadow-blue-500/25"
          >
            Find Client Leads
          </Link>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <h2 className="text-lg font-bold text-white">Companies</h2>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      filter === f.key
                        ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                        : "bg-slate-900/50 text-slate-400 border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company or contact…"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 w-full sm:w-56"
              />
            </div>
          </div>

          {loading || tableLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-violet-400" size={28} />
            </div>
          ) : !stats?.companies?.length ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              No companies match this filter.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                      <th className="px-4 py-3 font-medium w-8" />
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Stage</th>
                      <th className="px-4 py-3 font-medium">Last activity</th>
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-4 py-3 font-medium w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {stats.companies.map((row) => {
                      const open = !!expanded[row.id];
                      const history = historyCache[row.id] || [];
                      return (
                        <FragmentRow
                          key={row.id}
                          row={row}
                          open={open}
                          onToggle={() => toggle(row.id)}
                          history={history}
                          historyLoading={!!historyLoading[row.id]}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pagination && pagination.total > 0 && (
                <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-between items-center text-sm text-slate-500">
                  <span>
                    Showing {from}–{to} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40 hover:border-violet-500/50 flex items-center gap-1"
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
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40 hover:border-violet-500/50 flex items-center gap-1"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  row,
  open,
  onToggle,
  history,
  historyLoading,
}: {
  row: CompanyRow;
  open: boolean;
  onToggle: () => void;
  history: HistoryItem[];
  historyLoading: boolean;
}) {
  return (
    <>
      <tr className="border-b border-slate-800/80 hover:bg-slate-900/40 transition-colors">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="text-slate-400 hover:text-white"
            aria-label={open ? "Collapse history" : "Expand history"}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3">
          <Link
            href={`/dashboard/leads/${row.id}`}
            className="font-medium text-white hover:text-violet-300"
          >
            {row.businessName}
          </Link>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-slate-200">{row.contactName}</div>
          {row.email && (
            <div className="text-xs text-slate-500 truncate max-w-[180px]">{row.email}</div>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2.5 py-1 text-xs rounded-full border ${stageBadgeClass(
              row.status
            )}`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-slate-200">{row.lastActivity.label}</div>
          <div className="text-xs text-slate-500">
            {formatRelative(row.lastActivity.at)}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">
          {row.campaignName || "—"}
        </td>
        <td className="px-4 py-3">
          <Link
            href={`/dashboard/leads/${row.id}`}
            className="text-slate-500 hover:text-violet-300"
            title="Open lead"
          >
            <ExternalLink size={14} />
          </Link>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-800 bg-slate-950/40">
          <td colSpan={7} className="px-8 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">History</p>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${historyDot(
                        h.type
                      )}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-200">{h.label}</span>
                      <span className="text-slate-500 ml-2 text-xs">
                        {new Date(h.at).toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
