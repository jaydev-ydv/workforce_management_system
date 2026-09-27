const nodemailer = require("nodemailer");

/**
 * Creates a reusable nodemailer transporter based on environment variables.
 * Fallbacks to console logging in development if SMTP is unconfigured.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
  return null;
}

/**
 * Sends welcome & onboarding email to newly created employee with credentials.
 */
async function sendWelcomeEmail({ name, email, employeeId, tempPassword, loginUrl }) {
  const from = process.env.SMTP_FROM || '"Workforce Management" <no-reply@workforce.com>';
  const portalUrl = loginUrl || process.env.PORTAL_URL || "http://localhost:5000/employee-login.html";

  const subject = "Welcome to Workforce Hub - Your Account Credentials";
  const text = `
Welcome to Workforce Management System, ${name}!

Your employee account has been created by management.

---------------------------------------------------
Employee ID / Username: ${employeeId}
Temporary Password:     ${tempPassword}
Employee Portal:        ${portalUrl}
---------------------------------------------------

IMPORTANT: For security purposes, you will be required to change your temporary password upon your first login.

Best regards,
Workforce Management Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #334155;">
      <h2 style="color: #38bdf8; margin-top: 0;">Welcome to Workforce Management System</h2>
      <p>Hello <b>${name}</b>,</p>
      <p>Your official employee portal account has been created by administration.</p>
      
      <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid #475569; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <p style="margin: 6px 0;"><b>Staff ID:</b> <code style="color: #38bdf8; font-size: 15px;">${employeeId}</code></p>
        <p style="margin: 6px 0;"><b>Temporary Password:</b> <code style="color: #f43f5e; font-size: 15px;">${tempPassword}</code></p>
        <p style="margin: 6px 0;"><b>Portal Login:</b> <a href="${portalUrl}" style="color: #38bdf8;">${portalUrl}</a></p>
      </div>

      <p style="color: #facc15; font-size: 13px;">⚠️ <b>Important:</b> You will be prompted to change this temporary password immediately after your first login.</p>
      <br/>
      <p style="color: #94a3b8; font-size: 12px; border-top: 1px solid #334155; padding-top: 14px;">Workforce Management System Enterprise • Automated Delivery</p>
    </div>
  `;

  const transporter = getTransporter();

  if (transporter && email && email.includes("@")) {
    try {
      const info = await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html
      });
      console.log(`✉️ Email dispatched to ${email}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ SMTP Delivery failed for ${email}:`, err.message);
      // Fallback log so admin can still see it
      console.log(`[SIMULATED EMAIL TO ${email}]\nSubject: ${subject}\nEmployee ID: ${employeeId}\nTemp Password: ${tempPassword}`);
      return { success: true, simulated: true, error: err.message };
    }
  } else {
    console.log(`\n==================================================`);
    console.log(`✉️ [SIMULATED EMAIL DISPATCH] (Configure SMTP env for live delivery)`);
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Employee ID: ${employeeId}`);
    console.log(`Temp Password: ${tempPassword}`);
    console.log(`Login URL: ${portalUrl}`);
    console.log(`==================================================\n`);
    return { success: true, simulated: true };
  }
}

module.exports = {
  sendWelcomeEmail
};
