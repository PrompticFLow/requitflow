"use client";
import { useState, useEffect } from "react";
import { Search, Users, ExternalLink, Target, Trash2, Eye, BookmarkPlus, Loader2 } from "lucide-react";

export default function CandidatesDatabasePage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCandidates = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/candidates");
      const data = await res.json();
      if (data.candidates) setCandidates(data.candidates);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this candidate?")) return;
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
      if (res.ok) fetchCandidates();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredCandidates = candidates.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.jobTitle?.toLowerCase().includes(search.toLowerCase()) ||
    c.skills?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Candidate Database</h2>
          <p className="text-slate-400">View and manage sourced candidates for your outreach campaigns.</p>
        </div>
        <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 w-full md:w-80">
          <Search size={16} className="text-slate-400" />
          <input 
            type="text" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search candidates..." 
            className="bg-transparent border-none outline-none ml-2 w-full text-sm text-white placeholder-slate-500"
          />
        </div>
      </div>

      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Candidate</th>
                <th className="px-6 py-4 font-medium">Skills & Details</th>
                {/* <th className="px-6 py-4 font-medium text-center">AI Match Score</th> */}
                <th className="px-6 py-4 font-medium">Status / Source</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {fetching ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-32 mb-2"></div><div className="h-3 bg-slate-800 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-48 mb-2"></div><div className="h-3 bg-slate-800 rounded w-32"></div></td>
                    {/* <td className="px-6 py-4"><div className="h-8 bg-slate-800 rounded-full w-12 mx-auto"></div></td> */}
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-16 mb-2"></div><div className="h-3 bg-slate-800 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-8 bg-slate-800 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-800/50 text-slate-500 flex items-center justify-center rounded-full mb-4">
                        <Users size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">No candidates found yet.</h3>
                      <p className="text-slate-400 max-w-sm mb-6">Use Search Candidates to source profiles for your outreach campaigns.</p>
                      <a href="/dashboard/search-candidates" className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2">
                        <Search size={16} />
                        <span>Search Candidates</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white mb-1">{candidate.name}</div>
                      <div className="text-xs text-slate-400 font-medium">{candidate.jobTitle}</div>
                      <div className="text-xs text-slate-500 mt-1">{candidate.location} • {candidate.experience}</div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="text-xs text-slate-300 mb-2 font-medium line-clamp-1">{candidate.skills}</div>
                      {/* <div className="text-xs text-slate-500 italic line-clamp-2" title={candidate.aiSummary}>{candidate.aiSummary}</div> */}
                    </td>
                    {/* <td className="px-6 py-4 text-center">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm border ${
                        (candidate.matchScore || 0) >= 80 ? 'bg-green-500/10 text-green-400 border-green-500/30' : 
                        (candidate.matchScore || 0) >= 60 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {candidate.matchScore || '--'}
                      </div>
                    </td> */}
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-1 inline-block">
                        {candidate.status}
                      </span>
                      <div className="text-xs text-slate-500">From: {candidate.source}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button className="p-1.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700" title="View Profile">
                          <Eye size={16} />
                        </button>
                        <button className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20" title="Save Candidate">
                          <BookmarkPlus size={16} />
                        </button>
                        <div className="relative group inline-block">
                          <button disabled className="p-1.5 bg-slate-800 text-slate-600 rounded cursor-not-allowed border border-slate-700">
                            <Target size={16} />
                          </button>
                          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-xs text-slate-300 rounded shadow-lg z-10 text-center pointer-events-none">
                            Candidate outreach campaign connection coming next.
                          </div>
                        </div>
                        {candidate.profileUrl && (
                          <a href={candidate.profileUrl} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700" title="Open Job Board Link">
                            <ExternalLink size={16} />
                          </a>
                        )}
                        <button onClick={() => handleDelete(candidate.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20" title="Delete Candidate">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
