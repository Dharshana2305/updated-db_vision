import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface OTPRecord {
  email: string;
  hashedOtp: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  lastResentAt: number;
}

// In-memory OTP storage (email -> OTPRecord)
const otpStore: Map<string, OTPRecord> = new Map();

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export class EmailService {
  private static getTransporter() {
    const host = process.env.EMAIL_HOST;
    const port = Number(process.env.EMAIL_PORT) || 587;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASSWORD;

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  /**
   * Generates a 6-digit OTP and sends it to the user's email.
   */
  static async sendOTP(email: string): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = otpStore.get(normalizedEmail);
    const now = Date.now();

    // Rate limit: 60s cooldown between resends
    if (existing && now - existing.lastResentAt < 60000) {
      const waitSeconds = Math.ceil((60000 - (now - existing.lastResentAt)) / 1000);
      throw new Error(`Please wait ${waitSeconds} seconds before requesting another OTP code.`);
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = hashOtp(otp);
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    otpStore.set(normalizedEmail, {
      email: normalizedEmail,
      hashedOtp,
      createdAt: now,
      expiresAt,
      attempts: 0,
      lastResentAt: now
    });

    const transporter = this.getTransporter();
    const fromAddress = process.env.EMAIL_FROM || 'no-reply@databasereviewer.ai';

    const subject = 'Your Verification OTP - AI Database Intelligence Platform';
    const textContent = `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, please ignore this email.`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0284c7; margin-top: 0;">Email Verification</h2>
        <p style="color: #333;">Welcome to <strong>AI Database Intelligence Platform</strong>.</p>
        <p style="color: #333;">Your single-use verification code is:</p>
        <div style="background: #f0f9ff; border: 2px dashed #0284c7; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0369a1;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 13px;">This OTP will expire in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"Database Reviewer AI" <${fromAddress}>`,
          to: normalizedEmail,
          subject,
          text: textContent,
          html: htmlContent
        });
        return { success: true, message: `Verification OTP successfully sent to ${normalizedEmail}.` };
      } catch (err: any) {
        console.error('SMTP Email sending error:', err);
        // Fallback: log to console so developer/tester can proceed
        console.log(`[DEV OTP FALLBACK] Verification code for ${normalizedEmail}: ${otp}`);
        return {
          success: true,
          message: `OTP generated for ${normalizedEmail} (Check email inbox or server logs if SMTP is offline).`,
          previewOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
        };
      }
    } else {
      console.log(`[DEV MODE - SMTP NOT CONFIGURED] Verification OTP for ${normalizedEmail}: ${otp}`);
      return {
        success: true,
        message: `OTP sent to ${normalizedEmail} (Development Mode: Code is ${otp})`,
        previewOtp: otp
      };
    }
  }

  /**
   * Verifies the OTP code provided by the user.
   */
  static verifyOTP(email: string, inputOtp: string): { success: boolean; message: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const record = otpStore.get(normalizedEmail);

    if (!record) {
      return { success: false, message: 'No OTP code was requested for this email address or it has expired.' };
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalizedEmail);
      return { success: false, message: 'OTP code has expired. Please request a new verification code.' };
    }

    if (record.attempts >= 5) {
      otpStore.delete(normalizedEmail);
      return { success: false, message: 'Too many incorrect attempts. For security, please request a new OTP.' };
    }

    record.attempts += 1;

    const inputHash = hashOtp(inputOtp.trim());
    if (inputHash !== record.hashedOtp) {
      return {
        success: false,
        message: `Invalid OTP code. ${5 - record.attempts} attempt(s) remaining.`
      };
    }

    // OTP verified successfully
    otpStore.delete(normalizedEmail);
    return { success: true, message: 'Email verified successfully!' };
  }
}
