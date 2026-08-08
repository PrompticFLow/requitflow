"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Mail, PhoneCall, Activity, Loader2 } from "lucide-react";

type Notification = {
  id: string;
  type: "reply" | "call" | "activity";
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

const LAST_READ_KEY = "notificationsLastReadAt";
const POLL_INTERVAL_MS = 60_000;

const typeIcon = {
  reply: Mail,
  call: PhoneCall,
  activity: Activity,
} as const;

function readLastReadAt() {
  if (typeof window === "undefined") return 0;
  const stored = window.localStorage.getItem(LAST_READ_KEY);
  const parsed = stored ? Date.parse(stored) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Could not load notifications");
      const data = await res.json();
      setItems(data.notifications || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load (for the unread badge) plus background polling.
  useEffect(() => {
    setLastReadAt(readLastReadAt());
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unreadCount = items.filter((n) => new Date(n.createdAt).getTime() > lastReadAt).length;

  const markAllRead = () => {
    const now = new Date().toISOString();
    window.localStorage.setItem(LAST_READ_KEY, now);
    setLastReadAt(Date.parse(now));
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const openItem = (n: Notification) => {
    markAllRead();
    setOpen(false);
    router.push(n.href);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        suppressHydrationWarning
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative transition ${open ? "text-white" : "text-slate-400 hover:text-white"}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-blue-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50 z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition"
              >
                Mark all read
              </button>
            )}
          </div>

          {loading && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-8 text-center text-sm text-red-400">
              {error}
              <button
                type="button"
                onClick={load}
                className="block mx-auto mt-2 text-xs text-blue-400 hover:text-blue-300 transition"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              You&apos;re all caught up.
            </div>
          )}

          {items.map((n) => {
            const Icon = typeIcon[n.type] ?? Activity;
            const isUnread = new Date(n.createdAt).getTime() > lastReadAt;
            return (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => openItem(n)}
                className={`w-full flex gap-3 px-4 py-3 text-left border-b border-slate-800/60 last:border-b-0 transition hover:bg-slate-800/60 ${
                  isUnread ? "bg-blue-500/5" : ""
                }`}
              >
                <Icon size={16} className={`mt-0.5 shrink-0 ${isUnread ? "text-blue-400" : "text-slate-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{n.title}</p>
                  <p className="text-xs text-slate-400 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
