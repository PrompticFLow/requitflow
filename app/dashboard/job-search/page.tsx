"use client";

import { useState } from 'react';
import { 
  Search, MapPin, Briefcase, Filter, Calendar, DollarSign, 
  ChevronLeft, ChevronRight, Save, ExternalLink, Loader2,
  Building, Star, FileText, AlertCircle, RefreshCcw
} from 'lucide-react';
import Link from 'next/link';

export default function JobSearchPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    jobTitle: '',
    location: '',
    country: 'gb',
    category: '',
    workMode: 'Any',
    jobType: 'Any',
    experienceType: 'Any',
    datePosted: 'Any time',
    resultsPerPage: 25,
    sortOrder: 'Most recent'
  });

  // Results
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // View toggle
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  const handleSearch = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filters, page: pageNum })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search jobs');
      }

      setResults(data.items || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 0);
      setTotalResults(data.totalResults || 0);
    } catch (err: any) {
      setError(err.message || 'An error occurred during search.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const saveJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/saved-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, priority: 'Medium' })
      });
      if (!res.ok) throw new Error('Failed to save job');
      alert('Job saved successfully!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Job & Hiring Research
        </h1>
        <p className="text-slate-400 mt-2">
          Search active job openings and discover companies that may need B2B services, software, or support.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Job Title or Keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-500" size={18} />
              <input
                type="text"
                name="jobTitle"
                value={filters.jobTitle}
                onChange={handleFilterChange}
                placeholder="e.g. Software Engineer"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Location / City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-slate-500" size={18} />
              <input
                type="text"
                name="location"
                value={filters.location}
                onChange={handleFilterChange}
                placeholder="e.g. London"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Country</label>
            <select
              name="country"
              value={filters.country}
              onChange={handleFilterChange}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="us">United States</option>
              <option value="gb">United Kingdom</option>
              <option value="ca">Canada</option>
              <option value="au">Australia</option>
              <option value="in">India</option>
              <option value="de">Germany</option>
              <option value="fr">France</option>
              <option value="nl">Netherlands</option>
              <option value="pl">Poland</option>
              <option value="za">South Africa</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Job Type</label>
            <select
              name="jobType"
              value={filters.jobType}
              onChange={handleFilterChange}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="Any">Any Type</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
              <option value="Permanent">Permanent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Date Posted</label>
            <select
              name="datePosted"
              value={filters.datePosted}
              onChange={handleFilterChange}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="Any time">Any time</option>
              <option value="Last 24 hours">Last 24 hours</option>
              <option value="Last 3 days">Last 3 days</option>
              <option value="Last 7 days">Last 7 days</option>
              <option value="Last 14 days">Last 14 days</option>
              <option value="Last 30 days">Last 30 days</option>
            </select>
          </div>
          <div>
             <label className="block text-sm font-medium text-slate-400 mb-1">Results per page</label>
             <select
              name="resultsPerPage"
              value={filters.resultsPerPage}
              onChange={handleFilterChange}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={() => handleSearch(1)}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            <span>Search Jobs</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center space-x-3">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => handleSearch(page)} className="ml-auto underline text-sm hover:text-red-300">Retry</button>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Found {totalResults} active jobs</h2>
            <div className="flex items-center space-x-2 bg-slate-900 rounded-lg p-1 border border-slate-800">
              <button 
                onClick={() => setViewMode('card')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'card' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Cards
              </button>
              <button 
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Table
              </button>
            </div>
          </div>

          {viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((job) => (
                <div key={job.id} className="glass rounded-2xl p-6 border border-slate-800 flex flex-col hover:border-blue-500/50 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">{job.title}</h3>
                      <div className="flex items-center text-slate-400 mt-1 space-x-2">
                        <Building size={16} />
                        <span className="text-sm">{job.company?.name || 'Unknown Company'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-4 flex-1">
                    <div className="flex items-center text-slate-300 text-sm">
                      <MapPin size={16} className="text-slate-500 mr-2" />
                      <span className="truncate">{job.location || 'Location Not Disclosed'}</span>
                    </div>
                    <div className="flex items-center text-slate-300 text-sm">
                      <DollarSign size={16} className="text-slate-500 mr-2" />
                      <span>{job.salaryDisclosed ? `${job.salaryCurrency} ${job.salaryMin} - ${job.salaryMax}` : 'Salary not disclosed'}</span>
                    </div>
                    <div className="flex items-center text-slate-300 text-sm">
                      <Briefcase size={16} className="text-slate-500 mr-2" />
                      <span>{job.jobType || 'Type not specified'}</span>
                    </div>
                    <div className="flex items-center text-slate-300 text-sm">
                      <Calendar size={16} className="text-slate-500 mr-2" />
                      <span>Posted {new Date(job.datePosted).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex space-x-3 mt-6 pt-6 border-t border-slate-800">
                    <Link href={`/dashboard/jobs/${job.id}`} className="flex-1">
                      <button className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-sm font-medium transition-all">
                        View Details
                      </button>
                    </Link>
                    <button 
                      onClick={() => saveJob(job.id)}
                      className="bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white p-2 rounded-xl transition-all"
                      title="Save Job"
                    >
                      <Save size={20} />
                    </button>
                    {job.applicationUrl && (
                      <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">
                        <button className="bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 p-2 rounded-xl transition-all" title="Open Application">
                          <ExternalLink size={20} />
                        </button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-medium">Company</th>
                      <th className="px-6 py-4 font-medium">Job Title</th>
                      <th className="px-6 py-4 font-medium">Location</th>
                      <th className="px-6 py-4 font-medium">Job Type</th>
                      <th className="px-6 py-4 font-medium">Salary</th>
                      <th className="px-6 py-4 font-medium">Posted</th>
                      <th className="px-6 py-4 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {results.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{job.company?.name || '-'}</td>
                        <td className="px-6 py-4 text-blue-400"><Link href={`/dashboard/jobs/${job.id}`} className="hover:underline">{job.title}</Link></td>
                        <td className="px-6 py-4">{job.location || '-'}</td>
                        <td className="px-6 py-4">{job.jobType || '-'}</td>
                        <td className="px-6 py-4">{job.salaryDisclosed ? `${job.salaryMin} - ${job.salaryMax}` : 'Undisclosed'}</td>
                        <td className="px-6 py-4">{new Date(job.datePosted).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => saveJob(job.id)} className="text-slate-400 hover:text-blue-400 p-1"><Save size={16}/></button>
                          {job.applicationUrl && <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white p-1 inline-block"><ExternalLink size={16}/></a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-slate-800/50">
              <div className="text-sm text-slate-400">
                Showing page <span className="font-medium text-white">{page}</span> of <span className="font-medium text-white">{totalPages}</span>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleSearch(page - 1)}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 glass border border-slate-800 rounded-xl hover:bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-1"
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>
                <button 
                  onClick={() => handleSearch(page + 1)}
                  disabled={page === totalPages || loading}
                  className="px-4 py-2 glass border border-slate-800 rounded-xl hover:bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-1"
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !error && hasSearched && results.length === 0 && (
        <div className="glass rounded-2xl p-12 border border-slate-800 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Search className="text-slate-400" size={32} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No jobs found</h3>
          <p className="text-slate-400 max-w-md">
            No jobs found for these filters. Try changing the role, location, date range, or experience settings to see more results.
          </p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="glass rounded-2xl p-6 border border-slate-800 h-64 animate-pulse flex flex-col">
              <div className="h-6 bg-slate-800 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-slate-800 rounded w-1/2 mb-6"></div>
              <div className="space-y-3 flex-1">
                <div className="h-4 bg-slate-800 rounded w-full"></div>
                <div className="h-4 bg-slate-800 rounded w-full"></div>
                <div className="h-4 bg-slate-800 rounded w-2/3"></div>
              </div>
              <div className="flex space-x-3 mt-6 pt-6 border-t border-slate-800">
                <div className="h-10 bg-slate-800 rounded flex-1"></div>
                <div className="h-10 w-10 bg-slate-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
