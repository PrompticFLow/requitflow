"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, Users, UserPlus, Send, MessageSquare, 
  PhoneCall, BarChart3, Settings, LogOut, Search, Bell,
  BookOpen, KanbanSquare, Calendar, CreditCard
} from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen bg-black">
        <aside className="w-64 border-r border-white/10 bg-slate-950/80" />
        <main className="flex-1">
          <header className="h-20 border-b border-white/10 bg-slate-950/80" />
          <div className="p-6">
            <div className="h-8 w-64 animate-pulse rounded bg-white/10" />
            <div className="mt-4 h-64 animate-pulse rounded-xl bg-white/5" />
          </div>
        </main>
      </div>
    );
  }

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Find Client Leads", href: "/dashboard/generate-leads", icon: UserPlus },
    // { name: "Job & Hiring Search", href: "/dashboard/job-search", icon: Search },
    { name: "Client Lead Database", href: "/dashboard/leads", icon: Users },
    // { name: "Saved Jobs", href: "/dashboard/saved-jobs", icon: BookOpen },
    // { name: "Applied Jobs", href: "/dashboard/applied-jobs", icon: KanbanSquare },
    // { name: "Resume Match", href: "/dashboard/resume-match", icon: Users },
    // { name: "Campaigns", href: "/dashboard/campaigns", icon: Send },
    { name: "AI Email Agent", href: "/dashboard/ai-email-agent", icon: MessageSquare },
    // { name: "SMS Outreach", href: "/dashboard/sms-outreach", icon: MessageSquare },
    { name: "Replies Inbox", href: "/dashboard/replies", icon: MessageSquare },
    { name: "Booked Calls", href: "/dashboard/booked-calls", icon: PhoneCall },
    { name: "Knowledge Base", href: "/dashboard/knowledge-base", icon: BookOpen },
    // { name: "Sales Pipeline", href: "/dashboard/pipeline", icon: KanbanSquare },
    { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
    { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 glass border-r border-slate-800 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-lg shadow-violet-500/20 ring-1 ring-violet-500/30">
              <Image src="/logo.svg" alt="FunnelZen AI Logo" width={36} height={36} className="object-cover w-full h-full" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold bg-gradient-to-r from-violet-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent leading-tight tracking-tight">
                FunnelZen AI
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Lead Intelligence</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <span className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'sidebar-active' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                  <item.icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 mt-auto">
          <button 
            suppressHydrationWarning
            onClick={handleLogout}
            className="flex w-full items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-20 glass border-b border-slate-800 flex items-center justify-between px-8 z-10">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-full px-4 py-2 w-96">
            <Search size={18} className="text-slate-400" />
            <input 
              suppressHydrationWarning
              type="text" 
              placeholder="Search people, emails, companies, campaigns..." 
              className="bg-transparent border-none outline-none ml-3 w-full text-sm text-white placeholder-slate-500"
            />
          </div>
          <div className="flex items-center space-x-6">
            <button suppressHydrationWarning className="relative text-slate-400 hover:text-white transition">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-[2px]">
                <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center font-bold text-sm">
                  JD
                </div>
              </div>
            </div>
            <Link href="/dashboard/generate-leads" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-lg shadow-blue-500/25">
              Generate Leads
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 relative z-0">
          {children}
        </main>
      </div>
    </div>
  );
}
