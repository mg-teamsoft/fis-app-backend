import nodemailer from 'nodemailer';
import mjml2html from 'mjml';
import {
  generateMjmlTemplate,
  generateWelcomeMjmlTemplate,
  generatePasswordResetTemplate,
  generateContactInviteTemplate,
} from '../utils/mailTemplateUtil';

function createEmailTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,           // e.g., smtp.mailgun.org or smtp.gmail.com
    port: Number(process.env.SMTP_PORT),   // e.g., 587
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

export async function sendVerificationEmail(toEmail: string, verificationUrl: string) {
  const { html } = mjml2html(generateMjmlTemplate(verificationUrl));

  const transporter = createEmailTransporter();

  const info = await transporter.sendMail({
    from: '"My Fiş App" <no-reply@myfis-app.com>',
    to: toEmail,
    subject: 'Email Doğrulama – My Fiş App',
    html,
  });

  console.log('Email sent:', info.messageId);
}

export async function sendWelcomeEmail(toEmail: string, userName: string) {
  const { html } = mjml2html(generateWelcomeMjmlTemplate(userName));

  const transporter = createEmailTransporter();

  await transporter.sendMail({
    from: '"My Fiş App" <no-reply@fis-app.com>',
    to: toEmail,
    subject: `Hoş Geldin, ${userName}!`,
    html,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string) {
  const { html } = mjml2html(generatePasswordResetTemplate(resetUrl));

  const transporter = createEmailTransporter();

  await transporter.sendMail({
    from: '"My Fiş App" <no-reply@fis-app.com>',
    to: toEmail,
    subject: 'Şifre Sıfırlama Talebi',
    html,
  });
}

export async function sendContactInviteEmail(params: {
  toEmail: string;
  inviterDisplayName: string;
  isRegistered: boolean;
  acceptUrl: string;
  registerThenAcceptUrl: string;
  expiresAt: Date;
  permissions: string[];
}) {
  const {
    toEmail,
    inviterDisplayName,
    isRegistered,
    acceptUrl,
    registerThenAcceptUrl,
    expiresAt,
    permissions,
  } = params;

  const expiresAtText = expiresAt.toISOString();
  const actionLink = isRegistered ? acceptUrl : registerThenAcceptUrl;
  const actionLabel = isRegistered ? 'Invite in-app' : 'Register and accept invite';
  const { html } = mjml2html(
    generateContactInviteTemplate({
      inviterDisplayName,
      actionLink,
      actionLabel,
      expiresAtText,
      permissionsText: permissions.join(', '),
    })
  );

  const transporter = createEmailTransporter();


  await transporter.sendMail({
    from: '"My Fiş App" <no-reply@fis-app.com>',
    to: toEmail,
    subject: 'You have a supervisor invite',
    html,
  });
}
