"use client";
import { useState } from "react";
import { Search, MessageSquare, Check, X, RefreshCw } from "lucide-react";

export default function SMSOutreachPage() {
  const [messages] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">SMS Outreach</h2>
          <p className="text-slate-400">Manage and approve Twilio-powered AI SMS sequences for prospects and leads.</p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 w-80">
            <Search size={16} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Search SMS messages..." 
              className="bg-transparent border-none outline-none ml-2 w-full text-sm text-white placeholder-slate-500"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Lead & Phone</th>
                <th className="px-6 py-4 font-medium">Sequence Step</th>
                <th className="px-6 py-4 font-medium w-1/3">Message Preview</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-800/50 text-slate-500 flex items-center justify-center rounded-full mb-4">
                        <MessageSquare size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">No SMS outreach yet</h3>
                      <p className="text-slate-400 max-w-md">
                        SMS fallback will activate after no email reply when Twilio is connected.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{msg.lead}</div>
                      <div className="text-xs text-slate-500">{msg.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs">Step {msg.step}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 truncate max-w-xs">{msg.preview}</td>
                    <td className="px-6 py-4">
                      <span className="text-yellow-400 text-xs font-medium">{msg.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end space-x-2">
                      <button className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-colors" title="Edit">
                        <MessageSquare size={16} />
                      </button>
                      <button className="p-1.5 bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition-colors" title="Approve">
                        <Check size={16} />
                      </button>
                      <button className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors" title="Delete">
                        <X size={16} />
                      </button>
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
