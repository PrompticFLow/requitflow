"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Building, MapPin, Briefcase, Calendar, DollarSign, 
  ExternalLink, Save, ArrowLeft, Loader2, Zap, CheckCircle2,
  AlertCircle, Users, BarChart, XCircle
} from 'lucide-react';
import Link from 'next/link';

export default function JobDetailsPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  useEffect(() => {
    fetchJobDetails();
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch job');
      setJob(data.job);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveJob = async () => {
    try {
      const res = await fetch('/api/saved-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, priority: 'Medium' })
      });
      if (!res.ok) throw new Error('Failed to save job');
      alert('Job saved successfully!');
      fetchJobDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const analyzeJob = async () => {
    try {
      setAiAnalyzing(true);
      const res = await fetch(`/api/jobs/${jobId}/analyze`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze job');
      fetchJobDetails();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAiAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="glass rounded-2xl p-12 border border-slate-800 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-white mb-2">Error Loading Job</h2>
        <p className="text-slate-400">{error || 'Job not found'}</p>
        <Link href="/dashboard/job-search">
          <button className="mt-6 bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-xl transition-all">
            Back to Search
          </button>
        </Link>
      </div>
    );
  }

  const aiAnalysis = job.aiJobAnalyses?.[0];
  const isSaved = job.savedJobs?.length > 0;
  const isApplied = job.jobApplications?.length > 0;

  const renderBadge = (label: string, color: string) => (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <Link href="/dashboard/job-search" className="inline-flex items-center text-slate-400 hover:text-white transition-colors">
        <ArrowLeft size={16} className="mr-2" />
        Back to Search
      </Link>

      {/* Header Card */}
      <div className="glass rounded-2xl p-8 border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">{job.title}</h1>
            <div className="flex items-center space-x-2 text-xl text-blue-400 mb-6">
              <Building size={20} />
              <span>{job.company?.name || 'Unknown Company'}</span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <div className="flex items-center">
                <MapPin size={16} className="text-slate-500 mr-2" />
                {job.location || 'Not disclosed'}
              </div>
              <div className="flex items-center">
                <Briefcase size={16} className="text-slate-500 mr-2" />
                {aiAnalysis?.workMode || job.workMode || 'Not disclosed'}
              </div>
              <div className="flex items-center">
                <DollarSign size={16} className="text-slate-500 mr-2" />
                {job.salaryDisclosed ? `${job.salaryCurrency} ${job.salaryMin} - ${job.salaryMax}` : 'Salary not disclosed'}
              </div>
              <div className="flex items-center">
                <Briefcase size={16} className="text-slate-500 mr-2" />
                {job.jobType || 'Type not specified'}
              </div>
              <div className="flex items-center">
                <Calendar size={16} className="text-slate-500 mr-2" />
                Posted {new Date(job.datePosted).toLocaleDateString()}
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              {aiAnalysis?.hiringUrgency === 'High' && renderBadge('High Urgency', 'bg-red-500/20 text-red-400')}
              {aiAnalysis?.hiringUrgency === 'Medium' && renderBadge('Medium Urgency', 'bg-amber-500/20 text-amber-400')}
              {aiAnalysis?.hiringUrgency === 'Low' && renderBadge('Low Urgency', 'bg-slate-500/20 text-slate-400')}
              
              {aiAnalysis?.vacancyStatus === 'Publicly disclosed' && renderBadge('Vacancies Disclosed', 'bg-blue-500/20 text-blue-400')}
              
              {isSaved && renderBadge('Saved', 'bg-purple-500/20 text-purple-400')}
              {isApplied && renderBadge('Applied', 'bg-green-500/20 text-green-400')}
            </div>
          </div>

          <div className="flex flex-col space-y-3 w-full md:w-auto">
            {job.applicationUrl && (
              <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2">
                  <ExternalLink size={20} />
                  <span>Open Application</span>
                </button>
              </a>
            )}
            
            {!isSaved ? (
              <button onClick={saveJob} className="w-full bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center space-x-2">
                <Save size={20} />
                <span>Save Job</span>
              </button>
            ) : (
              <button disabled className="w-full bg-slate-800 text-slate-400 px-6 py-3 rounded-xl font-medium flex items-center justify-center space-x-2 cursor-not-allowed">
                <CheckCircle2 size={20} />
                <span>Saved</span>
              </button>
            )}

            {!aiAnalysis && (
              <button 
                onClick={analyzeJob} 
                disabled={aiAnalyzing}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center space-x-2 shadow-lg shadow-purple-500/25"
              >
                {aiAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                <span>AI Analyze Job</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {aiAnalysis && (
            <div className="glass rounded-2xl p-6 border border-purple-500/30 bg-purple-500/5 relative overflow-hidden">
              <div className="flex items-center space-x-2 text-purple-400 mb-4">
                <Zap size={20} />
                <h2 className="text-xl font-bold text-white">AI Analysis</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Summary</h3>
                  <p className="text-slate-300 leading-relaxed">{aiAnalysis.summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Required Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(aiAnalysis.requiredSkills || '[]').map((skill: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300">{skill}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Preferred Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(aiAnalysis.preferredSkills || '[]').map((skill: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300">{skill}</span>
                      ))}
                    </div>
                  </div>
                </div>
                
                {aiAnalysis.vacancyEvidence && (
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 mb-1 flex items-center"><Users size={16} className="mr-2"/> Vacancy Evidence</h3>
                    <p className="text-slate-300 italic">"{aiAnalysis.vacancyEvidence}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Original Description</h2>
            <div className="prose prose-invert max-w-none text-slate-300" dangerouslySetInnerHTML={{ __html: job.description || 'No description provided.' }} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6 border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-4">Company Insights</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400 text-sm">Active Job Posts</span>
                <span className="text-white font-medium">{job.company?.activeJobPostCount || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400 text-sm">Provider</span>
                <span className="text-blue-400 font-medium">{job.source || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400 text-sm">Vacancies</span>
                <span className="text-white font-medium">{job.vacancies !== null ? job.vacancies : 'Not disclosed'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400 text-sm">Required Experience</span>
                <span className="text-white font-medium">{job.requiredExperience || 'Not disclosed'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400 text-sm">Latest Activity</span>
                <span className="text-white font-medium">{job.company?.latestPostingDate ? new Date(job.company.latestPostingDate).toLocaleDateString() : 'N/A'}</span>
              </div>
              {aiAnalysis && (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-slate-400 text-sm">Hiring Urgency</span>
                    <span className={`font-medium ${aiAnalysis.hiringUrgency === 'High' ? 'text-red-400' : 'text-amber-400'}`}>{aiAnalysis.hiringUrgency || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-slate-400 text-sm">Candidates Needed</span>
                    <span className="text-white font-medium">{aiAnalysis.candidatesNeeded || 'Not disclosed'}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
              <Link href={`/dashboard/leads`}>
                <button className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center space-x-2">
                  <BarChart size={16} />
                  <span>View Client Leads</span>
                </button>
              </Link>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 border border-slate-800">
             <h2 className="text-lg font-bold text-white mb-4">Candidate Matching</h2>
             <p className="text-sm text-slate-400 mb-4">Find the best fit for this role from your candidate database.</p>
             <Link href={`/dashboard/ai-match-results?jobId=${job.id}`}>
               <button className="w-full bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center space-x-2">
                  <Users size={16} />
                  <span>Match Candidates</span>
               </button>
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
