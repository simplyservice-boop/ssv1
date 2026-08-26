import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private from = `Simply Service <${config.smtp.from || 'noreply@simplyservice.app'}>`;

  async send(options: EmailOptions): Promise<void> {
    if (!config.smtp.host) {
      logger.warn('SMTP not configured — skipping email send');
      return;
    }
    try {
      await transporter.sendMail({ from: this.from, ...options });
      logger.info(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      logger.error('Email send failed:', err);
    }
  }

  async sendWelcome(email: string, firstName: string, verifyToken: string) {
    const verifyUrl = `${config.webUrl}/verify-email/${verifyToken}`;
    await this.send({ to: email, subject: 'Welcome to Simply Service!',
      html: `<h2>Welcome, ${firstName}!</h2><p>Click below to verify your email address.</p><p><a href="${verifyUrl}" style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Verify Email</a></p><p>If you did not create this account, ignore this email.</p>`,
      text: `Welcome to Simply Service, ${firstName}! Verify your email: ${verifyUrl}`,
    });
  }

  async sendPasswordReset(email: string, firstName: string, resetToken: string) {
    const resetUrl = `${config.webUrl}/reset-password?token=${resetToken}`;
    await this.send({ to: email, subject: 'Reset Your Password',
      html: `<h2>Password Reset</h2><p>Hi ${firstName},</p><p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a></p>`,
      text: `Reset your Simply Service password: ${resetUrl}`,
    });
  }

  async sendWorkOrderNotification(email: string, firstName: string, workOrderTitle: string, status: string) {
    await this.send({ to: email, subject: `Work Order Update: ${workOrderTitle}`,
      html: `<h2>Work Order Status Update</h2><p>Hi ${firstName},</p><p>Your work order "<strong>${workOrderTitle}</strong>" has been updated to <strong>${status}</strong>.</p><p>Log in to Simply Service to view details.</p>`,
      text: `Work order "${workOrderTitle}" is now ${status}.`,
    });
  }

  async sendRentReminder(email: string, firstName: string, amount: number, dueDate: Date) {
    await this.send({ to: email, subject: 'Rent Payment Reminder',
      html: `<h2>Rent Due Soon</h2><p>Hi ${firstName},</p><p>Your rent of <strong>$${amount.toFixed(2)}</strong> is due on <strong>${dueDate.toLocaleDateString()}</strong>.</p><p>Log in to Simply Service to pay online.</p>`,
      text: `Rent reminder: $${amount.toFixed(2)} due ${dueDate.toLocaleDateString()}`,
    });
  }
}

export const emailService = new EmailService();
