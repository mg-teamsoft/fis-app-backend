import nodemailer from 'nodemailer';
import mjml2html from 'mjml';
import { generateMjmlTemplate, generateWelcomeMjmlTemplate, generatePasswordResetTemplate } from '../utils/mailTemplateUtil';

export async function sendVerificationEmail(toEmail: string, verificationUrl: string) {
  const { html } = mjml2html(generateMjmlTemplate(verificationUrl));

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,           // e.g., smtp.mailgun.org or smtp.gmail.com
    port: Number(process.env.SMTP_PORT),   // e.g., 587
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

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

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: '"My Fiş App" <no-reply@fis-app.com>',
    to: toEmail,
    subject: `Hoş Geldin, ${userName}!`,
    html,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string) {
  const { html } = mjml2html(generatePasswordResetTemplate(resetUrl));

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: '"My Fiş App" <no-reply@fis-app.com>',
    to: toEmail,
    subject: 'Şifre Sıfırlama Talebi',
    html,
  });
}
