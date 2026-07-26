"use client";
import { useState, useEffect } from "react";
import { Check, Server, Loader2, AlertCircle, Mail, Save, RefreshCw, Sparkles, KeyRound } from "lucide-react";

export default function SettingsPage() {
  const [jobSettings, setJobSettings] = useState<any>(null);
  
  // General Settings State
  const [appLanguage, setAppLanguage] = useState("en");
  const [autoSendMode, setAutoSendMode] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);

  // BYOK API Keys
  const [isByok, setIsByok] = useState(false);
  const [apiKeysConfigured, setApiKeysConfigured] = useState<Record<string, boolean>>({});
  const [apiKeysData, setApiKeysData] = useState({
    openRouterKeyEncrypted: '',
    neverBounceKeyEncrypted: '',
    apifyTokenEncrypted: '',
    bayOfAssetsKeyEncrypted: '',
    bayOfAssetsModel: '',
    pdlKeyEncrypted: '',
    twilioSidEncrypted: '',
    twilioAuthTokenEncrypted: '',
    twilioPhone: '',
  });
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  
  // SMTP Settings State
  const [smtpData, setSmtpData] = useState({
    senderName: '',
    senderEmail: '',
    smtpHost: '',
    smtpPort: '',
    smtpSecure: true,
    smtpUsername: '',
    smtpPassword: '',
    dailyLimit: 10,
    delayBetweenEmailsSeconds: 120
  });
  const [hasPassword, setHasPassword] = useState(false);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<any>({ isVerified: false, status: 'Unknown' });

  // IMAP Settings State
  const [imapData, setImapData] = useState({
    imapHost: '',
    imapPort: '993',
    imapSecure: true,
    imapUsername: '',
    imapPassword: '',
    imapEnabled: false
  });
  const [hasImapPassword, setHasImapPassword] = useState(false);
  const [imapLoading, setImapLoading] = useState(true);
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapStatus, setImapStatus] = useState<any>({ isVerified: false, status: 'Unknown' });

  // Google Calendar State
  const [calendarData, setCalendarData] = useState<any>({
    connected: false,
    googleEmail: '',
    calendarId: '',
    defaultDurationMinutes: 30,
    timezone: 'America/New_York',
    workingDays: 'MON,TUE,WED,THU,FRI',
    workingHourStart: '09:00',
    workingHourEnd: '17:00',
    bufferMinutes: 15
  });
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarsList, setCalendarsList] = useState<any[]>([]);

  // Calendly State
  const [calendlyData, setCalendlyData] = useState<{
    connected: boolean;
    calendlyEmail?: string;
    schedulingUrl?: string | null;
  }>({ connected: false });
  const [calendlyLoading, setCalendlyLoading] = useState(true);
  const [calendlyEventTypes, setCalendlyEventTypes] = useState<
    Array<{ uri: string; name: string; scheduling_url: string }>
  >([]);

  useEffect(() => {
    fetch("/api/settings/job-api")
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setJobSettings(data.settings);
        }
      })
      .catch(console.error);

    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (typeof data.isByok === 'boolean') setIsByok(data.isByok);
        if (data.configured) setApiKeysConfigured(data.configured);
        if (data.settings) {
          if (data.settings.appLanguage) setAppLanguage(data.settings.appLanguage);
          if (data.settings.autoSendMode !== undefined) setAutoSendMode(data.settings.autoSendMode);
          setApiKeysData(prev => ({
            ...prev,
            openRouterKeyEncrypted: data.settings.openRouterKeyEncrypted === '********' ? '' : (data.settings.openRouterKeyEncrypted || ''),
            neverBounceKeyEncrypted: data.settings.neverBounceKeyEncrypted === '********' ? '' : (data.settings.neverBounceKeyEncrypted || ''),
            apifyTokenEncrypted: data.settings.apifyTokenEncrypted === '********' ? '' : (data.settings.apifyTokenEncrypted || ''),
            bayOfAssetsKeyEncrypted: data.settings.bayOfAssetsKeyEncrypted === '********' ? '' : (data.settings.bayOfAssetsKeyEncrypted || ''),
            bayOfAssetsModel: data.settings.bayOfAssetsModel || '',
            pdlKeyEncrypted: data.settings.pdlKeyEncrypted === '********' ? '' : (data.settings.pdlKeyEncrypted || ''),
            twilioSidEncrypted: data.settings.twilioSidEncrypted === '********' ? '' : (data.settings.twilioSidEncrypted || ''),
            twilioAuthTokenEncrypted: data.settings.twilioAuthTokenEncrypted === '********' ? '' : (data.settings.twilioAuthTokenEncrypted || ''),
            twilioPhone: data.settings.twilioPhone || '',
          }));
        }
      })
      .catch(console.error);

    const loadSmtp = async () => {
      try {
        const res = await fetch("/api/settings/smtp", {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text();

        let data: any = null;

        if (contentType.includes("application/json")) {
          data = JSON.parse(rawText);
        }

        if (res.status === 401) {
          console.warn("SMTP config not loaded because user is not authenticated.");
          return;
        }

        if (!res.ok) {
          throw new Error(
            data?.error ||
            data?.technicalError ||
            `SMTP config fetch failed ${res.status}: ${rawText.slice(0, 300)}`
          );
        }

        if (data && data.success && data.smtp) {
          const smtp = data.smtp;
          setSmtpData({
            senderName: smtp.senderName || '',
            senderEmail: smtp.senderEmail || '',
            smtpHost: smtp.smtpHost || '',
            smtpPort: smtp.smtpPort ? smtp.smtpPort.toString() : '',
            smtpSecure: smtp.smtpSecure !== undefined ? smtp.smtpSecure : true,
            smtpUsername: smtp.smtpUsername || '',
            smtpPassword: '',
            dailyLimit: smtp.dailyLimit || 10,
            delayBetweenEmailsSeconds: smtp.delayBetweenEmailsSeconds || 120
          });
          setHasPassword(smtp.hasPassword);
          setSmtpStatus({ isVerified: smtp.verified, status: smtp.verified ? 'Active' : 'Failed' });
        } else if (data && data.error) {
          console.error("SMTP config fetch error:", data.error);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSmtpLoading(false);
      }
    };
    loadSmtp();

    fetch("/api/settings/imap")
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.imap) {
          const imap = data.imap;
          setImapData({
            imapHost: imap.imapHost || '',
            imapPort: imap.imapPort ? imap.imapPort.toString() : '993',
            imapSecure: imap.imapSecure !== undefined ? imap.imapSecure : true,
            imapUsername: imap.imapUsername || '',
            imapPassword: '',
            imapEnabled: imap.imapEnabled || false
          });
          setHasImapPassword(imap.hasPassword);
          setImapStatus({ isVerified: imap.imapVerified, status: imap.imapVerified ? 'Active' : 'Failed' });
        }
      })
      .catch(console.error)
      .finally(() => setImapLoading(false));

    fetch("/api/integrations/google-calendar/status")
      .then(res => res.json())
      .then(data => {
        if (data && data.connected) {
          setCalendarData(data);
          // Fetch available calendars if connected
          fetch("/api/integrations/google-calendar/calendars")
            .then(cres => cres.json())
            .then(cdata => {
              if (cdata.calendars) setCalendarsList(cdata.calendars);
            });
        }
      })
      .catch(console.error)
      .finally(() => setCalendarLoading(false));

    fetch("/api/integrations/calendly/status")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setCalendlyData(data);
          if (data.connected) {
            fetch("/api/integrations/calendly/event-types")
              .then((r) => r.json())
              .then((d) => {
                if (d.eventTypes) setCalendlyEventTypes(d.eventTypes);
              })
              .catch(() => {});
          }
        }
      })
      .catch(console.error)
      .finally(() => setCalendlyLoading(false));
  }, []);

  const handleSaveLanguage = async () => {
    setLanguageSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appLanguage, autoSendMode })
      });
      if (res.ok) {
        // Set cookie for google translate
        document.cookie = `googtrans=/en/${appLanguage}; path=/`;
        document.cookie = `googtrans=/en/${appLanguage}; domain=.${window.location.hostname}; path=/`;
        
        alert("General Settings saved successfully.");
        // Refresh to apply
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save settings.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save settings.");
    }
    setLanguageSaving(false);
  };

  const handleSaveApiKeys = async () => {
    setApiKeysSaving(true);
    try {
      const payload: Record<string, string> = {};
      const secretFields = [
        'openRouterKeyEncrypted',
        'neverBounceKeyEncrypted',
        'apifyTokenEncrypted',
        'bayOfAssetsKeyEncrypted',
        'pdlKeyEncrypted',
        'twilioSidEncrypted',
        'twilioAuthTokenEncrypted',
      ] as const;

      for (const field of secretFields) {
        const value = apiKeysData[field].trim();
        if (value) payload[field] = value;
      }
      if (apiKeysData.bayOfAssetsModel.trim()) {
        payload.bayOfAssetsModel = apiKeysData.bayOfAssetsModel.trim();
      }
      if (apiKeysData.twilioPhone.trim()) {
        payload.twilioPhone = apiKeysData.twilioPhone.trim();
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("API keys saved successfully.");
        setApiKeysData(prev => ({
          ...prev,
          openRouterKeyEncrypted: '',
          neverBounceKeyEncrypted: '',
          apifyTokenEncrypted: '',
          bayOfAssetsKeyEncrypted: '',
          pdlKeyEncrypted: '',
          twilioSidEncrypted: '',
          twilioAuthTokenEncrypted: '',
        }));
        const refreshed = await fetch("/api/settings").then(r => r.json());
        if (refreshed.configured) setApiKeysConfigured(refreshed.configured);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save API keys.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save API keys.");
    }
    setApiKeysSaving(false);
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    // Log safe payload before request
    console.log("Saving SMTP settings:", {
      senderName: smtpData.senderName,
      senderEmail: smtpData.senderEmail,
      smtpHost: smtpData.smtpHost,
      smtpPort: smtpData.smtpPort,
      smtpSecure: smtpData.smtpSecure,
      smtpUsername: smtpData.smtpUsername,
      hasPassword: Boolean(smtpData.smtpPassword),
      dailyLimit: smtpData.dailyLimit
    });

    try {
      const res = await fetch("/api/settings/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtpData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || "SMTP settings saved successfully.");
        setHasPassword(true);
        // Clear password input field
        setSmtpData(prev => ({ ...prev, smtpPassword: '' }));
        // Set verified badge to Not Verified until user clicks Test SMTP
        setSmtpStatus({ isVerified: false, status: 'Active' });
      } else {
        alert(data.error || "Failed to save SMTP settings.");
      }
    } catch (e) {
      alert("An error occurred while saving settings.");
    }
    setSmtpSaving(false);
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    try {
      const res = await fetch("/api/settings/smtp/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert("Success: " + data.message);
        setSmtpStatus({ isVerified: true, status: 'Active' });
      } else {
        alert("Error: " + data.error);
        setSmtpStatus({ isVerified: false, status: 'Failed' });
      }
    } catch (e) {
      alert("An error occurred while testing connection.");
    }
    setSmtpTesting(false);
  };

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true);
    try {
      const res = await fetch("/api/settings/smtp/send-test-email", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert("Success: " + data.message);
      } else {
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("An error occurred while sending test email.");
    }
    setSendingTestEmail(false);
  };

  const handleSaveImap = async () => {
    setImapSaving(true);
    try {
      const res = await fetch("/api/settings/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imapData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("IMAP settings saved successfully.");
        setHasImapPassword(true);
        setImapData(prev => ({ ...prev, imapPassword: '' }));
        setImapStatus({ isVerified: false, status: 'Active' });
      } else {
        alert(data.error || "Failed to save IMAP settings.");
      }
    } catch (e) {
      alert("An error occurred while saving IMAP settings.");
    }
    setImapSaving(false);
  };

  const handleTestImap = async () => {
    setImapTesting(true);
    try {
      const res = await fetch("/api/settings/imap/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imapData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Success: " + data.message);
        setImapStatus({ isVerified: true, status: 'Active' });
      } else {
        alert("Error: " + data.error);
        setImapStatus({ isVerified: false, status: 'Failed' });
      }
    } catch (e) {
      alert("An error occurred while testing IMAP connection.");
    }
    setImapTesting(false);
  };

  const handleSaveCalendar = async () => {
    setCalendarSaving(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calendarData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Calendar settings saved successfully.");
      } else {
        alert(data.error || "Failed to save calendar settings.");
      }
    } catch (e) {
      alert("An error occurred while saving calendar settings.");
    }
    setCalendarSaving(false);
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm("Are you sure you want to disconnect Google Calendar?")) return;
    try {
      await fetch("/api/integrations/google-calendar/disconnect", { method: "POST" });
      setCalendarData({ ...calendarData, connected: false, googleEmail: '' });
      alert("Google Calendar disconnected.");
    } catch (e) {
      alert("Failed to disconnect calendar.");
    }
  };

  const handleDisconnectCalendly = async () => {
    if (!confirm("Are you sure you want to disconnect Calendly?")) return;
    try {
      await fetch("/api/integrations/calendly/disconnect", { method: "POST" });
      setCalendlyData({ connected: false });
      setCalendlyEventTypes([]);
      alert("Calendly disconnected.");
    } catch (e) {
      alert("Failed to disconnect Calendly.");
    }
  };

  const handleSetCalendlySchedulingUrl = async (schedulingUrl: string) => {
    try {
      const res = await fetch("/api/integrations/calendly/set-scheduling-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedulingUrl }),
      });
      if (res.ok) {
        setCalendlyData((prev) => ({ ...prev, schedulingUrl }));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update scheduling URL.");
      }
    } catch {
      alert("Failed to update scheduling URL.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Settings</h2>
        <p className="text-slate-400">Configure your email provider and outreach limits.</p>
      </div>

      <div className="columns-1 lg:columns-2 gap-6">

        {/* General Settings */}
        <div className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <Sparkles className="text-purple-400" size={24} />
              <h3 className="text-xl font-bold text-white">General Settings</h3>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-400">Application Language</label>
              <select value={appLanguage} onChange={e => setAppLanguage(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="nl">Dutch</option>
                <option value="ru">Russian</option>
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="ja">Japanese</option>
                <option value="ar">Arabic</option>
                <option value="hi">Hindi</option>
                <option value="ko">Korean</option>
                <option value="tr">Turkish</option>
              </select>
              <p className="text-xs text-slate-500">Select the language for the entire application interface.</p>
            </div>

            <button onClick={handleSaveLanguage} disabled={languageSaving} className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
              {languageSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save General Settings
            </button>
          </div>
        </div>

        {/* BYOK API Keys — only when IS_BYOK=true */}
        {isByok && (
          <div id="api-keys" className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <KeyRound className="text-purple-400" size={24} />
                <h3 className="text-xl font-bold text-white">API Keys</h3>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              This deployment requires you to bring your own keys. Leave a field blank to keep the currently saved key.
            </p>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  OpenRouter API Key
                  {apiKeysConfigured.openrouter && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeysData.openRouterKeyEncrypted}
                  onChange={e => setApiKeysData({ ...apiKeysData, openRouterKeyEncrypted: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder={apiKeysConfigured.openrouter ? "Saved key hidden. Enter a new key only to replace it." : "sk-or-..."}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  NeverBounce API Key
                  {apiKeysConfigured.neverbounce && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeysData.neverBounceKeyEncrypted}
                  onChange={e => setApiKeysData({ ...apiKeysData, neverBounceKeyEncrypted: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder={apiKeysConfigured.neverbounce ? "Saved key hidden. Enter a new key only to replace it." : ""}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Apify API Token
                  {apiKeysConfigured.apify && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeysData.apifyTokenEncrypted}
                  onChange={e => setApiKeysData({ ...apiKeysData, apifyTokenEncrypted: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder={apiKeysConfigured.apify ? "Saved key hidden. Enter a new key only to replace it." : "apify_api_..."}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Bay of Assets API Key
                  {apiKeysConfigured.bayofassets && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeysData.bayOfAssetsKeyEncrypted}
                  onChange={e => setApiKeysData({ ...apiKeysData, bayOfAssetsKeyEncrypted: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder={apiKeysConfigured.bayofassets ? "Saved key hidden. Enter a new key only to replace it." : ""}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400">Bay of Assets Model (optional)</label>
                <input
                  type="text"
                  value={apiKeysData.bayOfAssetsModel}
                  onChange={e => setApiKeysData({ ...apiKeysData, bayOfAssetsModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder="Optional model override"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  People Data Labs API Key
                  {apiKeysConfigured.pdl && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeysData.pdlKeyEncrypted}
                  onChange={e => setApiKeysData({ ...apiKeysData, pdlKeyEncrypted: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder={apiKeysConfigured.pdl ? "Saved key hidden. Enter a new key only to replace it." : ""}
                  autoComplete="off"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    Twilio Account SID
                    {apiKeysConfigured.twilio && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30">Saved</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={apiKeysData.twilioSidEncrypted}
                    onChange={e => setApiKeysData({ ...apiKeysData, twilioSidEncrypted: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                    placeholder={apiKeysConfigured.twilio ? "Saved. Enter only to replace." : "AC..."}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Twilio Auth Token</label>
                  <input
                    type="password"
                    value={apiKeysData.twilioAuthTokenEncrypted}
                    onChange={e => setApiKeysData({ ...apiKeysData, twilioAuthTokenEncrypted: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                    placeholder={apiKeysConfigured.twilio ? "Saved. Enter only to replace." : ""}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400">Twilio Phone Number</label>
                <input
                  type="text"
                  value={apiKeysData.twilioPhone}
                  onChange={e => setApiKeysData({ ...apiKeysData, twilioPhone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                  placeholder="+15551234567"
                />
              </div>

              <button
                onClick={handleSaveApiKeys}
                disabled={apiKeysSaving}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                {apiKeysSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save API Keys
              </button>
            </div>
          </div>
        )}

        {/* SMTP Settings */}
        <div id="smtp" className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <Mail className="text-purple-400" size={24} />
              <h3 className="text-xl font-bold text-white">SMTP Settings</h3>
            </div>
            {smtpStatus.isVerified && (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center space-x-1">
                <Check size={14} /> <span>Verified</span>
              </span>
            )}
            {!smtpStatus.isVerified && smtpStatus.status === 'Failed' && (
              <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30">
                Connection Failed
              </span>
            )}
          </div>
          
          <p className="text-sm text-slate-400 leading-relaxed mb-4">
            Connect your own SMTP sender. For safety, campaigns can send maximum 10 emails per day by default, with at least 1 minute delay between emails.
          </p>

          <div className="bg-slate-800/50 p-4 rounded-lg mb-6 text-xs text-slate-300 space-y-2 border border-slate-700">
            <p className="font-medium text-slate-200">Gmail Configuration Examples:</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-400">
              <li><strong>SSL:</strong> Host: smtp.gmail.com | Port: 465 | Secure: true</li>
              <li><strong>TLS:</strong> Host: smtp.gmail.com | Port: 587 | Secure: false</li>
              <li><strong>Password:</strong> Use a <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Google App Password</a>, not your normal Gmail password.</li>
            </ul>
          </div>

          {smtpLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-purple-500" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Sender Name</label>
                  <input type="text" value={smtpData.senderName} onChange={e => setSmtpData({...smtpData, senderName: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="John Doe" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Sender Email</label>
                  <input type="email" value={smtpData.senderEmail} onChange={e => setSmtpData({...smtpData, senderEmail: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="john@example.com" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="text-sm font-medium text-slate-400">SMTP Host</label>
                  <input type="text" value={smtpData.smtpHost} onChange={e => setSmtpData({...smtpData, smtpHost: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Port</label>
                  <input type="text" value={smtpData.smtpPort} onChange={e => setSmtpData({...smtpData, smtpPort: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="587" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">SMTP Username</label>
                  <input type="text" value={smtpData.smtpUsername} onChange={e => setSmtpData({...smtpData, smtpUsername: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">SMTP Password</label>
                  <input type="password" value={smtpData.smtpPassword} onChange={e => setSmtpData({...smtpData, smtpPassword: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder={hasPassword ? "Saved password hidden. Enter a new password only to replace it." : ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 pt-6">
                  <input type="checkbox" id="secure" checked={smtpData.smtpSecure} onChange={e => setSmtpData({...smtpData, smtpSecure: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-900 cursor-pointer" />
                  <label htmlFor="secure" className="text-sm font-medium text-slate-400 cursor-pointer">Use Secure / TLS</label>
                </div>
              </div>

              <div className="flex flex-col space-y-3 pt-4">
                <div className="flex space-x-3">
                  <button onClick={handleSaveSmtp} disabled={smtpSaving} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
                    {smtpSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save SMTP Settings
                  </button>
                  <button onClick={handleTestSmtp} disabled={smtpTesting || (!hasPassword && !smtpData.smtpPassword)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors border border-slate-700 flex items-center justify-center gap-2">
                    {smtpTesting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Test SMTP
                  </button>
                </div>
                {smtpStatus.isVerified && (
                  <button onClick={handleSendTestEmail} disabled={sendingTestEmail} className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
                    {sendingTestEmail ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />} Send Test Email
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
          {/* Inbox Reply Capture Card */}
          <div className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <Mail className="text-purple-400" size={24} />
                <h3 className="text-xl font-bold text-white">Inbox Reply Capture</h3>
              </div>
              {imapStatus.isVerified && imapData.imapEnabled && (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center space-x-1">
                  <Check size={14} /> <span>Reply Capture Verified</span>
                </span>
              )}
              {(!imapStatus.isVerified || !imapData.imapEnabled) && (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30">
                  Reply Capture Not Verified
                </span>
              )}
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Enable IMAP polling so the app can fetch, triage, and reply to inbound cold email responses automatically from your inbox.
            </p>

            <div className="flex items-center space-x-2 pb-4">
              <input 
                type="checkbox" 
                id="imapEnabled" 
                checked={imapData.imapEnabled} 
                onChange={e => setImapData({...imapData, imapEnabled: e.target.checked})} 
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 cursor-pointer" 
              />
              <label htmlFor="imapEnabled" className="text-sm font-semibold text-slate-200 cursor-pointer">
                Enable reply capture via IMAP
              </label>
            </div>

            {imapData.imapEnabled && (
              <>
                <div className="bg-slate-800/50 p-4 rounded-lg text-xs text-slate-300 space-y-2 border border-slate-700">
                  <p className="font-medium text-slate-200">Gmail / Google Workspace Helper:</p>
                  <p className="text-slate-400">
                    Use <strong>imap.gmail.com</strong>, port <strong>993</strong>, secure <strong>true</strong>, and the same <strong>Google App Password</strong>.
                  </p>
                </div>

                {imapLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-purple-500" /></div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1 col-span-2">
                        <label className="text-sm font-medium text-slate-400">IMAP Host</label>
                        <input type="text" value={imapData.imapHost} onChange={e => setImapData({...imapData, imapHost: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="imap.gmail.com" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-400">Port</label>
                        <input type="text" value={imapData.imapPort} onChange={e => setImapData({...imapData, imapPort: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="993" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-400">IMAP Username</label>
                        <input type="text" value={imapData.imapUsername} onChange={e => setImapData({...imapData, imapUsername: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder="user@gmail.com" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-400">IMAP Password</label>
                        <input type="password" value={imapData.imapPassword} onChange={e => setImapData({...imapData, imapPassword: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500" placeholder={hasImapPassword ? "Saved password hidden. Replace..." : ""} />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="imapSecure" checked={imapData.imapSecure} onChange={e => setImapData({...imapData, imapSecure: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-900 cursor-pointer" />
                      <label htmlFor="imapSecure" className="text-sm font-medium text-slate-400 cursor-pointer">Use SSL / Secure TLS</label>
                    </div>

                    <div className="flex space-x-3 pt-2">
                      <button onClick={handleSaveImap} disabled={imapSaving} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
                        {imapSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save IMAP Settings
                      </button>
                      <button onClick={handleTestImap} disabled={imapTesting || (!hasImapPassword && !imapData.imapPassword)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors border border-slate-700 flex items-center justify-center gap-2">
                        {imapTesting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Test IMAP
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!imapData.imapEnabled && (
              <button onClick={handleSaveImap} disabled={imapSaving} className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
                {imapSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Changes
              </button>
            )}
          </div>

          {/* Safety & Anti-Ban Settings */}
          <div className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white">Safety & Anti-Ban Settings</h3>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Daily Email Limit</label>
                  <input 
                    type="number" 
                    min="1"
                    max="1000"
                    value={smtpData.dailyLimit} 
                    onChange={e => {
                      let val = parseInt(e.target.value) || 0;
                      setSmtpData({...smtpData, dailyLimit: val});
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-purple-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Delay between emails (min)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={smtpData.delayBetweenEmailsSeconds / 60} 
                    onChange={e => {
                      let val = parseInt(e.target.value) || 0;
                      setSmtpData({...smtpData, delayBetweenEmailsSeconds: val * 60});
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-purple-500" 
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`text-sm font-medium ${!autoSendMode ? 'text-purple-400' : 'text-slate-300'}`}>Human Handle Default</h4>
                    <p className="text-xs text-slate-500">Wait for human review before sending AI drafted replies.</p>
                  </div>
                  <button 
                    onClick={() => setAutoSendMode(false)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${!autoSendMode ? 'bg-purple-600' : 'bg-slate-800'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${!autoSendMode ? 'left-5' : 'left-1'}`}></div>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`text-sm font-medium ${autoSendMode ? 'text-purple-400' : 'text-slate-300'}`}>AI Auto-Reply</h4>
                    <p className="text-xs text-slate-500">Allow AI to autonomously reply to objections.</p>
                  </div>
                  <button 
                    onClick={() => setAutoSendMode(true)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${autoSendMode ? 'bg-purple-600' : 'bg-slate-800'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoSendMode ? 'left-5' : 'left-1'}`}></div>
                  </button>
                </div>
              </div>
              
              <button onClick={async () => {
                try {
                  // Save language/autoSendMode
                  await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ appLanguage, autoSendMode })
                  });
                  
                  // Save SMTP limits
                  await fetch("/api/settings/smtp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(smtpData)
                  });
                  
                  alert("Safety & Anti-Ban settings saved successfully.");
                } catch(e) {
                  alert("Failed to save settings.");
                }
              }} className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
                <Save size={18} /> Save Safety Settings
              </button>
            </div>
          </div>
          {/* Google Calendar Integration Card */}
          <div className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/>
                </svg>
                <h3 className="text-xl font-bold text-white">Google Calendar Integration</h3>
              </div>
              {calendarData.connected ? (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center space-x-1">
                  <Check size={14} /> <span>Connected</span>
                </span>
              ) : (
                <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded border border-slate-500/30">
                  Not Connected
                </span>
              )}
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              AI can use your calendar availability to suggest real meeting times and book calls automatically when leads express interest.
            </p>

            {calendarLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : !calendarData.connected ? (
              <div className="flex justify-center py-4">
                <button onClick={async () => {
                  try {
                    const res = await fetch('/api/integrations/google-calendar/connect', { headers: { 'Accept': 'application/json' } });
                    if (res.ok || res.status === 400) {
                      const contentType = res.headers.get('content-type');
                      if (contentType && contentType.includes('application/json')) {
                        const data = await res.json();
                        if (data.error) {
                          alert("Google Calendar is not configured. Please add Google OAuth environment variables.");
                          return;
                        }
                      }
                    }
                    window.location.href = '/api/integrations/google-calendar/connect';
                  } catch (e) {
                    window.location.href = '/api/integrations/google-calendar/connect';
                  }
                }} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center gap-2">
                  Connect Google Calendar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-800/50 p-4 rounded-lg text-sm text-slate-300 border border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="block text-xs text-slate-500">Connected Account</span>
                    <strong className="text-white">{calendarData.googleEmail}</strong>
                  </div>
                  <button onClick={handleDisconnectCalendar} className="text-red-400 hover:text-red-300 text-xs">Disconnect</button>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Select Calendar</label>
                  <select value={calendarData.calendarId || ''} onChange={e => setCalendarData({...calendarData, calendarId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500">
                    <option value="">Primary Calendar</option>
                    {calendarsList.map(c => (
                      <option key={c.id} value={c.id}>{c.summary}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Default Duration</label>
                    <select value={calendarData.defaultDurationMinutes} onChange={e => setCalendarData({...calendarData, defaultDurationMinutes: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500">
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Buffer Time</label>
                    <select value={calendarData.bufferMinutes} onChange={e => setCalendarData({...calendarData, bufferMinutes: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500">
                      <option value="0">No buffer</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Working Hours Start</label>
                    <input type="time" value={calendarData.workingHourStart} onChange={e => setCalendarData({...calendarData, workingHourStart: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Working Hours End</label>
                    <input type="time" value={calendarData.workingHourEnd} onChange={e => setCalendarData({...calendarData, workingHourEnd: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-400">Timezone</label>
                  <input type="text" value={calendarData.timezone} onChange={e => setCalendarData({...calendarData, timezone: e.target.value})} placeholder="e.g. America/New_York" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500" />
                </div>

                <button onClick={handleSaveCalendar} disabled={calendarSaving} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2 mt-2">
                  {calendarSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Calendar Settings
                </button>
              </div>
            )}
          </div>

          {/* Calendly Integration Card */}
          <div className="glass p-8 rounded-2xl border border-slate-700/50 space-y-6 break-inside-avoid mb-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-blue-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm-7-9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
                <h3 className="text-xl font-bold text-white">Calendly Integration</h3>
              </div>
              {calendlyData.connected ? (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center space-x-1">
                  <Check size={14} /> <span>Connected</span>
                </span>
              ) : (
                <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded border border-slate-500/30">
                  Not Connected
                </span>
              )}
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Connect Calendly to use your scheduling link in campaigns and sync booked meetings into the pipeline automatically.
            </p>

            {calendlyLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : !calendlyData.connected ? (
              <div className="flex justify-center py-4">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/integrations/calendly/connect', { headers: { Accept: 'application/json' } });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        alert(data.error || "Calendly is not configured. Add CALENDLY_* environment variables.");
                        return;
                      }
                      if (data.url) {
                        window.location.href = data.url;
                        return;
                      }
                    } catch {
                      // fall through
                    }
                    window.location.href = '/api/integrations/calendly/connect';
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center gap-2"
                >
                  Connect Calendly
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-800/50 p-4 rounded-lg text-sm text-slate-300 border border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="block text-xs text-slate-500">Connected Account</span>
                    <strong className="text-white">{calendlyData.calendlyEmail}</strong>
                  </div>
                  <button onClick={handleDisconnectCalendly} className="text-red-400 hover:text-red-300 text-xs">Disconnect</button>
                </div>

                {calendlyEventTypes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Default Event Type</label>
                    <select
                      value={calendlyData.schedulingUrl || ''}
                      onChange={(e) => handleSetCalendlySchedulingUrl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500"
                    >
                      <option value="">Select event type…</option>
                      {calendlyEventTypes.map((et) => (
                        <option key={et.uri} value={et.scheduling_url}>{et.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {calendlyData.schedulingUrl && (
                  <div className="text-sm text-slate-400">
                    Scheduling URL:{" "}
                    <a href={calendlyData.schedulingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 break-all">
                      {calendlyData.schedulingUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
      </div>

    </div>
  );
}
