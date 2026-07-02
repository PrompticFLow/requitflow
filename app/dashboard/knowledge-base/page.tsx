"use client";
import { useState, useEffect } from "react";
import { BookOpen, UploadCloud, FileText, BrainCircuit, Trash2, Loader2 } from "lucide-react";

export default function KnowledgeBasePage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge-base');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    setUploading(true);
    try {
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        fetchFiles();
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      alert("Failed to upload the file. Please try again.");
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      await fetch(`/api/knowledge-base/${id}`, { method: 'DELETE' });
      fetchFiles();
    } catch (e) {
      console.error(e);
    }
  };

  const [pastedText, setPastedText] = useState("");
  const handlePasteUpload = async () => {
    if (!pastedText.trim()) return;
    setUploading(true);
    const file = new File([pastedText], `Pasted-Text-${Date.now()}.txt`, { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        fetchFiles();
        setPastedText("");
      }
    } catch (err) {}
    setUploading(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex items-center space-x-4 mb-2">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <BookOpen className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Knowledge Base</h1>
          <p className="text-slate-400 text-sm mt-1">Train your AI agent with your business's unique value proposition.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          
          <div className="glass p-8 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">Upload Documents</h3>
            
            <label className={`border-2 border-dashed border-slate-700/50 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${uploading ? 'bg-slate-800/50 cursor-not-allowed' : 'bg-slate-900/20 hover:bg-slate-900/40 cursor-pointer'}`}>
              <input type="file" className="hidden" accept=".pdf,.docx,.txt,.csv,.md,.json" onChange={handleUpload} disabled={uploading} />
              <div className="w-16 h-16 bg-blue-500/10 text-blue-400 flex items-center justify-center rounded-full mb-4">
                {uploading ? <Loader2 size={32} className="animate-spin" /> : <UploadCloud size={32} />}
              </div>
              <h4 className="text-white font-medium text-lg mb-2">
                {uploading ? "Uploading file..." : "Click to upload or drag and drop"}
              </h4>
              <p className="text-slate-400 text-sm max-w-sm mb-6">
                Supported formats: PDF, DOCX, TXT, CSV, Markdown
                <br />
                Maximum size: 10 MB per file
              </p>
              <div className={`px-6 py-2.5 rounded-xl font-medium ${uploading ? 'bg-slate-800 text-slate-500' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>
                {uploading ? "Please wait" : "Browse Files"}
              </div>
            </label>
          </div>

          <div className="glass p-8 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">Or Paste Text/Website URL Content</h3>
            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-sm focus:border-purple-500 outline-none transition-all"
              placeholder="Paste any text here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              disabled={uploading}
            />
            <div className="mt-4 flex justify-end">
              <button 
                onClick={handlePasteUpload}
                disabled={uploading || !pastedText.trim()}
                className="px-6 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex gap-2 items-center"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                Upload Text
              </button>
            </div>
          </div>

          <div className="glass p-8 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">Your Knowledge Files</h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-purple-500" size={32} />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-700 rounded-xl">
                <p className="text-slate-400">No files uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map(file => (
                  <div key={file.id} className="p-4 bg-slate-900 border border-slate-700 rounded-lg flex items-start justify-between hover:border-slate-600 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-slate-800 rounded-lg shrink-0 mt-1">
                        <FileText size={20} className="text-blue-400" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{file.fileName}</h4>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-xl">{file.summary || "No summary available."}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded ${file.status === 'Ready' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {file.status}
                          </span>
                          <span className="text-slate-500 text-xs">{(file.fileSize / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(file.id)}
                      className="text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-slate-800 bg-blue-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BrainCircuit size={64} className="text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center">
              <BrainCircuit size={20} className="text-blue-400 mr-2" />
              How AI uses this
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed relative z-10">
              The AI Email Agent uses these documents to improve email sequences. By learning your agency offers, case studies, FAQs, common objections, and specific tone of voice, the AI writes highly personalized and convincing outreach emails automatically.
            </p>
          </div>

          <div className="glass p-6 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-slate-500">Recommended Uploads</h3>
            <ul className="space-y-3">
              <li className="flex items-center text-sm text-slate-400">
                <FileText size={16} className="text-blue-400/70 mr-3" />
                Case Studies & Testimonials
              </li>
              <li className="flex items-center text-sm text-slate-400">
                <FileText size={16} className="text-purple-400/70 mr-3" />
                Service Agreements & Terms
              </li>
              <li className="flex items-center text-sm text-slate-400">
                <FileText size={16} className="text-pink-400/70 mr-3" />
                Objection Handling Scripts
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
