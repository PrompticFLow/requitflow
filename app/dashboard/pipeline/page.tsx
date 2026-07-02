import { KanbanSquare } from "lucide-react";

export default function PipelinePlaceholder() {
  const stages = [
    { name: "New Client Lead", color: "bg-blue-500" },
    { name: "Contacted", color: "bg-purple-500" },
    { name: "Replied", color: "bg-pink-500" },
    { name: "Interested", color: "bg-orange-500" },
    { name: "Discovery Call Booked", color: "bg-green-500" },
    { name: "Won Client", color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-[85vh] flex flex-col">
      <div className="flex justify-between items-center mb-2 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <KanbanSquare className="text-blue-400" size={24} />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-white">Sales Pipeline</h1>
              <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                This feature is planned
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">Track your client leads through the sales cycle.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex space-x-4 h-full min-w-max">
          {stages.map((stage) => (
            <div key={stage.name} className="w-72 flex flex-col h-full bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
                  <h3 className="font-semibold text-slate-300">{stage.name}</h3>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-1 rounded-md">0</span>
              </div>
              <div className="flex-1 p-4 flex flex-col items-center justify-center text-center opacity-50">
                <div className="w-full h-24 border-2 border-dashed border-slate-700/50 rounded-xl flex items-center justify-center mb-3">
                  <span className="text-slate-500 text-sm">Drop lead here</span>
                </div>
                <p className="text-slate-500 text-xs">No leads in this stage</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
