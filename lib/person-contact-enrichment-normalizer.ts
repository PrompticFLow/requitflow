function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeContactEnrichment(rawLead: any) {
  let email = null;
  let emailStatus = "Missing";
  let phone = null;
  let phoneStatus = "Missing";
  
  // Try to find email
  const possibleEmails = [
    rawLead.email,
    rawLead.emails?.[0],
    rawLead.workEmail,
    rawLead.businessEmail,
    rawLead.verifiedEmail
  ];

  for (const e of possibleEmails) {
    if (e && typeof e === 'string' && isValidEmail(e)) {
      // Rule: Do not invent email (regex check & existence check)
      // Rule: Lowercase email
      email = e.toLowerCase();
      break;
    }
  }

  // Determine email status
  if (email) {
    const rawEmailStatus = rawLead.email_status || rawLead.emailStatus;
    if (rawEmailStatus && typeof rawEmailStatus === 'string' && rawEmailStatus.toLowerCase().includes('verif')) {
      emailStatus = "Verified";
    } else {
      emailStatus = "Found";
    }
  }

  // Try to find phone
  const possiblePhones = [
    rawLead.phone,
    rawLead.phones?.[0],
    rawLead.mobile,
    rawLead.mobilePhone
  ];

  for (const p of possiblePhones) {
    if (p && typeof p === 'string' && p.trim().length > 0) {
      phone = p.trim();
      break;
    }
  }

  // Determine phone status
  if (phone) {
    phoneStatus = "Found";
  }

  // Get other identifiers
  const linkedinUrl = rawLead.linkedinUrl || rawLead.profileUrl || rawLead.url || null;
  const fullName = rawLead.fullName || rawLead.name || null;
  const companyName = rawLead.companyName || rawLead.company || null;
  const website = rawLead.website || null;

  return {
    linkedinUrl,
    fullName,
    email,
    emailStatus,
    phone,
    phoneStatus,
    companyName,
    website,
    rawData: rawLead
  };
}
