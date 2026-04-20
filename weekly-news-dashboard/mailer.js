require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendDigest(pdfBuffer) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM || !EMAIL_TO) {
    throw new Error('Missing required email environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO)');
  }

  const port = parseInt(SMTP_PORT || '587', 10);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const recipients = EMAIL_TO.split(',').map(e => e.trim()).filter(Boolean);
  const dateStr = new Date().toISOString().slice(0, 10);

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: recipients.join(', '),
    subject: `Weekly News Digest \u2014 ${dateStr}`,
    text: "Please find this week's news digest attached.",
    attachments: [
      {
        filename: `news-digest-${dateStr}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  console.log(`Digest emailed to: ${recipients.join(', ')}`);
}

module.exports = { sendDigest };
