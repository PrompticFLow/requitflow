"use client";
import { Users, Send, MessageSquare, PhoneCall, Building2, Briefcase, Activity, Calendar } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function DashboardOverview() {
  const [hiringStats, setHiringStats] = useState({
    companiesHiring: 0,
    activeJobPostsFound: 0,
    highHiringActivityCompanies: 0,
    recentPosts7Days: 0,
    isLoading: true
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/companies-hiring');
        if (res.ok) {
          const data = await res.json();
          const companies = data.companies || [];
          const summary = data.summary || {};
          
          let activeJobPostsFound = summary.totalOpenRolesFound || 0;
          let highHiringActivityCompanies = 0;
          let recentPosts7Days = 0; // Not fully tracked by this endpoint, but we prevent the crash

          companies.forEach((c: any) => {
            if (c.hiringActivity === 'High' || c.hiringActivity === 'High Activity') {
              highHiringActivityCompanies++;
            }
          });

          setHiringStats({
            companiesHiring: summary.totalHiringCompanies || 0,
            activeJobPostsFound,
            highHiringActivityCompanies,
            recentPosts7Days,
            isLoading: false
          });
        }
      } catch (e) {
        console.error('Failed to fetch hiring stats', e);
        setHiringStats(s => ({ ...s, isLoading: false }));
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
          <p className="text-slate-400">Welcome to your FunnelZen AI command center.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/dashboard/leads" className="glass p-6 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-all">
              <Users className="text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Client Leads</p>
              <h3 className="text-2xl font-bold text-white mt-1">Manage</h3>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/campaigns" className="glass p-6 rounded-2xl border border-slate-800 hover:border-purple-500/50 transition-all group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-all">
              <Send className="text-purple-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Campaigns</p>
              <h3 className="text-2xl font-bold text-white mt-1">View</h3>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/replies" className="glass p-6 rounded-2xl border border-slate-800 hover:border-pink-500/50 transition-all group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-pink-500/10 rounded-xl group-hover:bg-pink-500/20 transition-all">
              <MessageSquare className="text-pink-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Replies</p>
              <h3 className="text-2xl font-bold text-white mt-1">Inbox</h3>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/booked-calls" className="glass p-6 rounded-2xl border border-slate-800 hover:border-green-500/50 transition-all group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-green-500/10 rounded-xl group-hover:bg-green-500/20 transition-all">
              <PhoneCall className="text-green-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Booked Calls</p>
              <h3 className="text-2xl font-bold text-white mt-1">Schedule</h3>
            </div>
          </div>
        </Link>
      </div>

      <h2 className="text-xl font-bold text-white mt-8 mb-4">Hiring Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/dashboard/person-leads" className="glass p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/50 transition-all group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-500/10 rounded-xl group-hover:bg-indigo-500/20 transition-all">
              <Building2 className="text-indigo-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Companies Hiring</p>
              <h3 className="text-2xl font-bold text-white mt-1">{hiringStats.isLoading ? '...' : hiringStats.companiesHiring}</h3>
            </div>
          </div>
        </Link>
        <div className="glass p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Briefcase className="text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Active Job Posts Found</p>
              <h3 className="text-2xl font-bold text-white mt-1">{hiringStats.isLoading ? '...' : hiringStats.activeJobPostsFound}</h3>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-green-500/10 rounded-xl">
              <Activity className="text-green-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">High Activity Cos.</p>
              <h3 className="text-2xl font-bold text-white mt-1">{hiringStats.isLoading ? '...' : hiringStats.highHiringActivityCompanies}</h3>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-500/10 rounded-xl">
              <Calendar className="text-purple-400" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Posts in Last 7 Days</p>
              <h3 className="text-2xl font-bold text-white mt-1">{hiringStats.isLoading ? '...' : hiringStats.recentPosts7Days}</h3>
            </div>
          </div>
        </div>
      </div>
      
      <div className="glass p-8 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center mt-8">
        <div className="w-16 h-16 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/20">
          <Users className="text-blue-400" size={32} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Get Started</h3>
        <p className="text-slate-400 max-w-md mb-6">Start by generating your first list of ideal client leads and launching an automated email campaign.</p>
        <Link href="/dashboard/generate-leads" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg shadow-blue-500/25">
          Find Client Leads
        </Link>
      </div>
    </div>
  );
}
