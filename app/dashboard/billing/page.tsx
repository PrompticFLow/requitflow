import { CreditCard, CheckCircle2, Zap } from "lucide-react";

export default function BillingPlaceholder() {
  const plans = [
    { name: "Starter", price: "$49", features: ["1,000 Client Leads/mo", "Basic Email Automation", "1 Email Account Connect"] },
    { name: "Pro", price: "$149", features: ["10,000 Client Leads/mo", "Advanced AI Personalization", "5 Email Accounts Connect", "AI Agent Candidate Search"] },
    { name: "Agency", price: "$299", features: ["Unlimited Leads", "White-label Dashboard", "Unlimited Email Accounts"] }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div className="flex items-center space-x-4 mb-2">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <CreditCard className="text-blue-400" size={24} />
        </div>
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white">Billing & Usage</h1>
            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
              Payment integration coming later
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">Manage your subscription and monitor API usage.</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-slate-800 bg-blue-500/5 flex justify-between items-center">
        <div>
          <p className="text-slate-400 text-sm font-medium">Current Plan</p>
          <h2 className="text-2xl font-bold text-white mt-1">Free / Demo</h2>
        </div>
        <button disabled className="bg-slate-800 text-slate-500 px-6 py-2.5 rounded-xl font-medium cursor-not-allowed">
          Manage Payment Method
        </button>
      </div>

      <div>
        <h3 className="text-lg font-bold text-white mb-4">Current Usage</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass p-5 rounded-2xl border border-slate-800">
            <p className="text-slate-400 text-sm font-medium mb-1">Client leads generated</p>
            <div className="flex items-end space-x-2">
              <h3 className="text-2xl font-bold text-white">0</h3>
              <span className="text-slate-500 text-sm mb-1">/ 100</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: "0%" }}></div></div>
          </div>
          <div className="glass p-5 rounded-2xl border border-slate-800">
            <p className="text-slate-400 text-sm font-medium mb-1">Emails sent</p>
            <div className="flex items-end space-x-2">
              <h3 className="text-2xl font-bold text-white">0</h3>
              <span className="text-slate-500 text-sm mb-1">/ 500</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: "0%" }}></div></div>
          </div>
          <div className="glass p-5 rounded-2xl border border-slate-800">
            <p className="text-slate-400 text-sm font-medium mb-1">Campaigns created</p>
            <div className="flex items-end space-x-2">
              <h3 className="text-2xl font-bold text-white">0</h3>
              <span className="text-slate-500 text-sm mb-1">/ 3</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3"><div className="bg-pink-500 h-1.5 rounded-full" style={{ width: "0%" }}></div></div>
          </div>
          <div className="glass p-5 rounded-2xl border border-slate-800">
            <p className="text-slate-400 text-sm font-medium mb-1">Candidates searched</p>
            <div className="flex items-end space-x-2">
              <h3 className="text-2xl font-bold text-white">0</h3>
              <span className="text-slate-500 text-sm mb-1">/ 0</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: "0%" }}></div></div>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <h3 className="text-lg font-bold text-white mb-6">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.name} className="glass p-8 rounded-2xl border border-slate-800 flex flex-col opacity-75">
              <h4 className="text-xl font-bold text-white">{plan.name}</h4>
              <div className="mt-4 mb-6">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-slate-400">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center text-sm text-slate-300">
                    <CheckCircle2 size={16} className="text-blue-400 mr-3 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button disabled className="w-full bg-slate-800 text-slate-500 py-3 rounded-xl font-medium cursor-not-allowed">
                Upgrade to {plan.name}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
