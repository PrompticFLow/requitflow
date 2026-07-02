"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Building2, MapPin, Briefcase, Calendar, Globe, Activity, TrendingUp, AlertCircle, ArrowLeft, Lightbulb, Users } from 'lucide-react';

export default function CompanyHiringDetail() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  
  const [company, setCompany] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchCompanyDetails();
  }, [id]);

  const fetchCompanyDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (!res.ok) throw new Error('Failed to fetch company details');
      const data = await res.json();
      setCompany(data);
    } catch (err: any) {
      setError('Company details could not be loaded. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-1/4 bg-slate-800 rounded"></div>
        <div className="h-64 bg-slate-800 rounded-2xl border border-slate-700"></div>
        <div className="space-y-4">
          <div className="h-20 bg-slate-800 rounded-xl border border-slate-700"></div>
          <div className="h-20 bg-slate-800 rounded-xl border border-slate-700"></div>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="space-y-6">
        <button onClick={() => router.back()} className="flex items-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} className="mr-2" /> Back to Companies
        </button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 flex flex-col items-center justify-center text-red-400 min-h-[300px]">
          <AlertCircle size={48} className="mb-4 text-red-500/50" />
          <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
          <p>{error || 'Company not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Building2 className="text-blue-500" /> {company.companyName}
            </h1>
            {company.companyWebsite && (
              <a href={company.companyWebsite.startsWith('http') ? company.companyWebsite : `https://${company.companyWebsite}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 mt-1">
                <Globe size={14} /> {company.companyWebsite}
              </a>
            )}
          </div>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/25">
          Add to Leads
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Metrics Card */}
        <div className="lg:col-span-2 glass p-6 rounded-2xl border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-6">Hiring Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Active Posts</p>
              <p className="text-3xl font-bold text-white">{company.activeJobPostsFound}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Last 7 Days</p>
              <p className="text-3xl font-bold text-white">{company.recentPosts7Days}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Last 30 Days</p>
              <p className="text-3xl font-bold text-white">{company.recentPosts30Days}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Locations</p>
              <p className="text-3xl font-bold text-white">{company.locations.length}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Activity Status</h3>
              <div className="flex items-center gap-2">
                {company.hiringActivity === 'High Activity' ? (
                  <span className="px-3 py-1.5 bg-green-500/20 text-green-400 text-sm rounded-lg font-bold flex items-center gap-2"><TrendingUp size={16}/> High Activity</span>
                ) : company.hiringActivity === 'Medium Activity' ? (
                  <span className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-sm rounded-lg font-bold flex items-center gap-2"><Activity size={16}/> Medium Activity</span>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-500/20 text-slate-400 text-sm rounded-lg font-bold">Low Activity</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Hiring Demand</h3>
              <div className="flex items-center gap-2">
                {company.hiringDemand === 'High' ? (
                  <span className="px-3 py-1.5 bg-purple-500/20 text-purple-400 text-sm rounded-lg font-bold">High Demand</span>
                ) : company.hiringDemand === 'Medium' ? (
                  <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 text-sm rounded-lg font-bold">Medium Demand</span>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-500/20 text-slate-400 text-sm rounded-lg font-bold">Low Demand</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insight Card */}
        <div className="glass p-6 rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-900/10 to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Lightbulb className="text-blue-400" size={18} />
            </div>
            <h2 className="text-lg font-bold text-white">AI Hiring Insight</h2>
          </div>
          {company.aiHiringInsight ? (
            <p className="text-slate-300 leading-relaxed text-sm">
              {company.aiHiringInsight}
            </p>
          ) : (
            <p className="text-slate-300 leading-relaxed text-sm italic">
              This company has {company.activeJobPostsFound} active job posts. 
              {company.recentPosts7Days > 0 ? ` They are actively recruiting, with ${company.recentPosts7Days} roles posted in the last week.` : ''}
              {company.locations.length > 1 ? ` They are hiring across ${company.locations.length} different locations.` : ''} 
              This indicates {company.hiringDemand.toLowerCase()} demand.
            </p>
          )}
        </div>
      </div>

      {/* Active Jobs List */}
      <div className="glass p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Active Job Listings</h2>
          <span className="bg-slate-800 text-slate-300 py-1 px-3 rounded-full text-sm font-medium">{company.jobs.length} Jobs Found</span>
        </div>

        <div className="space-y-4">
          {company.jobs.map((job: any) => (
            <div key={job.id} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 hover:border-blue-500/30 transition-all flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    <Link href={`/dashboard/jobs/${job.id}`} className="hover:text-blue-400 transition-colors">
                      {job.title}
                    </Link>
                  </h3>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-400 mt-2">
                    {job.location && (
                      <span className="flex items-center gap-1"><MapPin size={14} /> {job.location}</span>
                    )}
                    {job.category && (
                      <span className="flex items-center gap-1"><Briefcase size={14} /> {job.category}</span>
                    )}
                    {job.datePosted && (
                      <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(job.datePosted).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {job.applicationUrl && (
                    <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Apply Now
                    </a>
                  )}
                  <span className="text-xs text-slate-500">Provider: {job.source || 'Unknown'}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Work Mode</p>
                  <p className="text-sm font-medium text-slate-300">{job.workMode || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Job Type</p>
                  <p className="text-sm font-medium text-slate-300">{job.jobType || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Salary</p>
                  <p className="text-sm font-medium text-slate-300">{job.salaryDisclosed ? `${job.salaryMin || ''} - ${job.salaryMax || ''} ${job.salaryCurrency}` : 'Not disclosed'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Vacancy Status</p>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-white">{job.vacancies ? `${job.vacancies} Vacancies` : 'Not specified'}</span>
                    <span className="text-[10px] text-slate-400">{job.vacancyStatus}</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-4 border-t border-slate-700/50">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Required Experience</p>
                  <p className="text-sm text-slate-300">{job.requiredExperience || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Required Skills</p>
                  <p className="text-sm text-slate-300 line-clamp-2">{job.requiredSkills || 'Not specified'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
