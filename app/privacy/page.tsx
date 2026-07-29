import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="mb-8">
          <Link href="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
            &larr; Back to Home
          </Link>
        </div>
        
        <h1 className="text-4xl font-bold text-white mb-6">Privacy Policy</h1>
        
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>
            <p>
              We collect information that you provide directly to us when using FunnelZen AI, including your name, email address, API keys you supply for email delivery (such as Resend), and OAuth authentication details when connecting services like Calendly. We also collect data about your leads and campaigns necessary to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Information</h2>
            <p>
              We use the information we collect to operate and maintain FunnelZen AI, send automated outreach on your behalf, process AI-generated replies, and improve the quality of our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Third-Party Integrations</h2>
            <p>
              Our app integrates with third-party services like Resend (email delivery) and Calendly (scheduling). By providing your API keys or connecting your accounts, you grant us access to perform actions on your behalf, such as sending emails and syncing scheduled meetings. API keys are stored encrypted and are only used to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data Security</h2>
            <p>
              We take data security seriously and implement industry-standard measures to protect your information and credentials. Passwords and SMTP credentials are encrypted at rest.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at support@funnelzenai.com.
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
