import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="mb-8">
          <Link href="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
            &larr; Back to Home
          </Link>
        </div>
        
        <h1 className="text-4xl font-bold text-white mb-6">Terms of Service</h1>
        
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using FunnelZen AI, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, you may not access or use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              FunnelZen AI is an AI-powered sales outreach and lead generation platform. We provide tools to automate email campaigns, manage leads, and handle inbound responses using artificial intelligence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. User Obligations</h2>
            <p>
              You agree to use our service only for lawful purposes. You are strictly prohibited from using our platform to send unsolicited spam, malicious content, or content that violates any local, national, or international laws (such as CAN-SPAM or GDPR). You are responsible for all activity that occurs under your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. API and Integrations</h2>
            <p>
              When connecting third-party services like Google Workspace or SendGrid, you agree to abide by their respective terms of service. We are not responsible for any limitations, suspensions, or terminations of your third-party accounts caused by your use of our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Disclaimer of Warranties</h2>
            <p>
              The service is provided on an "as is" and "as available" basis. We make no warranties, expressed or implied, regarding the availability, reliability, or accuracy of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Contact</h2>
            <p>
              For any questions regarding these Terms, please contact us at support@funnelzenai.com.
            </p>
          </section>
        </div>
        
        <div className="mt-10 text-xs text-slate-500 pt-6 border-t border-slate-800">
          Last updated: {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
