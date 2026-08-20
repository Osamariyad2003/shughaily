import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

export interface MailAttachment {
  filename: string;
  /** Either a Buffer/base64 content, or an http(s) URL nodemailer will fetch itself. */
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  /** Optional custom headers, e.g. a stable X-Job-Id for traceability. */
  headers?: Record<string, string>;
}

export interface SendMailResult {
  messageId: string;
}

/**
 * Generic SMTP mail transport, shared by every feature that needs to send
 * outbound email (today: the email auto-apply pipeline). Works with any
 * SMTP-speaking provider — SES SMTP endpoint, SendGrid, Mailgun, Gmail SMTP
 * for local dev, etc. — configured purely via env vars, so swapping
 * providers never touches application code.
 *
 * Safe by construction: if SMTP_HOST isn't set, `send()` throws a clear,
 * typed error instead of silently pretending to succeed or crashing the
 * process at boot. Callers (the auto-apply orchestrator) are expected to
 * catch this and record it as a failed send, same as any other SMTP error.
 */
class MailerService {
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(config.smtp.host);
  }

  private getTransporter(): Transporter {
    if (!this.isConfigured()) {
      throw new Error(
        'Mailer is not configured (SMTP_HOST is unset). Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to enable outbound email.',
      );
    }
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      });
    }
    return this.transporter;
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from: config.smtp.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
      headers: input.headers,
    });
    return { messageId: info.messageId };
  }
}

export const mailerService = new MailerService();
