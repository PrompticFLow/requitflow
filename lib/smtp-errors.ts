export function mapSmtpError(error: any): string {
  if (!error) return "SMTP test failed. Please check your SMTP settings.";

  const code = error?.code;
  const message = error?.message || '';

  if (code === 'EAUTH') {
    return "SMTP login failed. Please check your email address and app password.";
  }

  if (code === 'ECONNECTION') {
    return "Could not connect to the SMTP server. Please check host, port, and secure settings.";
  }

  if (code === 'ETIMEDOUT') {
    return "SMTP connection timed out. Please check provider settings, firewall, host, and port.";
  }

  if (code === 'ECONNREFUSED') {
    return "SMTP connection was refused. Please check host and port.";
  }

  if (message.includes('Invalid login')) {
    return "SMTP login failed. Use an app password instead of your normal email password.";
  }

  if (message.includes('Username and Password not accepted')) {
    return "SMTP login failed. For Gmail or Google Workspace, use an App Password.";
  }

  if (message.includes('self signed certificate') || message.includes('certificate')) {
    return "SMTP certificate error. Try the recommended secure/port settings for your provider.";
  }

  if (message.includes('Greeting never received')) {
    return "SMTP server did not respond. Please check host, port, and secure setting.";
  }

  if (message.includes('decrypted') || message.includes('Decryption failed')) {
    return "SMTP password could not be decrypted. Please re-enter and save your SMTP password.";
  }

  if (message.includes('missing password')) {
    return "SMTP password is missing. Please re-enter and save your SMTP password.";
  }

  return "SMTP test failed. Please check your SMTP settings.";
}
