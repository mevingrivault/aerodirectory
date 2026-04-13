import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

interface SyncSummaryMailRun {
  source: string;
  status: string;
  durationMs: number | null | undefined;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextRetryAt: string | null;
  summary: Record<string, unknown>;
  errorMessage?: string | null;
}

export interface MailDiagnosticsSnapshot {
  checkedAt: string;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  appUrl: string;
  user: string | null;
  verified: boolean;
  verifyError: string | null;
}

function parseBoolean(value: string | boolean | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | number | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const candidate = error as Error & {
    code?: string;
    response?: string;
    responseCode?: number;
    command?: string;
  };

  return [
    candidate.message,
    candidate.code ? `code=${candidate.code}` : null,
    candidate.responseCode ? `responseCode=${candidate.responseCode}` : null,
    candidate.command ? `command=${candidate.command}` : null,
    candidate.response ? `response=${candidate.response}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function maskValue(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpSecure: boolean;
  private readonly smtpUser?: string;

  constructor(private readonly config: ConfigService) {
    this.from =
      this.config.get<string>("MAIL_FROM") ||
      this.config.get<string>("SMTP_FROM") ||
      "Navventura <noreply@navventura.fr>";

    this.appUrl =
      this.config.get<string>("APP_URL") ||
      this.config.get<string>("FRONTEND_URL") ||
      (this.config.get<string>("NODE_ENV") === "production"
        ? "https://navventura.fr"
        : "http://localhost:3000");

    this.smtpHost = this.config.get<string>("SMTP_HOST", "localhost");
    this.smtpPort = parseNumber(this.config.get<string>("SMTP_PORT"), 587);
    this.smtpSecure = parseBoolean(
      this.config.get<string>("SMTP_SECURE"),
      this.smtpPort === 465,
    );
    this.smtpUser = this.config.get<string>("SMTP_USER") || undefined;
    const smtpPass = this.config.get<string>("SMTP_PASS") || undefined;

    this.transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpSecure,
      auth:
        this.smtpUser && smtpPass
          ? {
              user: this.smtpUser,
              pass: smtpPass,
            }
          : undefined,
    });
  }

  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log(
        `SMTP ready on ${this.smtpHost}:${this.smtpPort} (secure=${this.smtpSecure}, user=${this.smtpUser ?? "none"}, from=${this.from})`,
      );
    } catch (error) {
      this.logger.error(
        `SMTP verification failed for ${this.smtpHost}:${this.smtpPort} (secure=${this.smtpSecure}, from=${this.from}) | ${getErrorDetails(error)}`,
      );
    }
  }

  async getDiagnosticsSnapshot(): Promise<MailDiagnosticsSnapshot> {
    try {
      await this.transporter.verify();
      return {
        checkedAt: new Date().toISOString(),
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpSecure,
        from: this.from,
        appUrl: this.appUrl,
        user: maskValue(this.smtpUser),
        verified: true,
        verifyError: null,
      };
    } catch (error) {
      return {
        checkedAt: new Date().toISOString(),
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpSecure,
        from: this.from,
        appUrl: this.appUrl,
        user: maskValue(this.smtpUser),
        verified: false,
        verifyError: getErrorDetails(error),
      };
    }
  }

  async sendAdminTestEmail(
    email: string,
    payload: { requestedBy: string },
  ): Promise<{ messageId: string; diagnostics: MailDiagnosticsSnapshot }> {
    const diagnostics = await this.getDiagnosticsSnapshot();

    const result = await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: "Test e-mail Navventura",
      html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"></head>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
          <h2 style="margin-bottom:8px;">Test d'envoi e-mail</h2>
          <p>Ce message a été envoyé depuis l'administration Navventura.</p>
          <p><strong>Demandé par :</strong> ${payload.requestedBy}</p>
          <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
          <p><strong>SMTP :</strong> ${diagnostics.host}:${diagnostics.port} (secure=${diagnostics.secure ? "true" : "false"})</p>
        </body>
        </html>
      `,
      text: `Test d'envoi e-mail Navventura\n\nDemandé par : ${payload.requestedBy}\nDate : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}\nSMTP : ${diagnostics.host}:${diagnostics.port} (secure=${diagnostics.secure ? "true" : "false"})`,
    });

    return {
      messageId: result.messageId,
      diagnostics,
    };
  }

  async sendEmailVerification(email: string, token: string): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: "Confirmez votre adresse e-mail Navventura",
        html: `
          <!DOCTYPE html>
          <html lang="fr">
          <head><meta charset="UTF-8"></head>
          <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
            <h2 style="margin-bottom: 8px;">Confirmez votre adresse e-mail</h2>
            <p>Bienvenue sur Navventura.</p>
            <p>Pour activer votre compte, confirmez votre adresse e-mail en cliquant sur le bouton ci-dessous.</p>
            <a href="${verifyUrl}"
               style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Vérifier mon adresse e-mail
            </a>
            <p style="color: #6b7280; font-size: 14px;">
              Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet e-mail.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
              <a href="${verifyUrl}" style="color: #2563eb;">${verifyUrl}</a>
            </p>
          </body>
          </html>
        `,
        text: `Bienvenue sur Navventura.\n\nConfirmez votre adresse e-mail en cliquant sur ce lien :\n${verifyUrl}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send verification email to ${email} | ${getErrorDetails(err)}`,
      );
    }
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: "Réinitialisation de votre mot de passe Navventura",
        html: `
          <!DOCTYPE html>
          <html lang="fr">
          <head><meta charset="UTF-8"></head>
          <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
            <h2 style="margin-bottom: 8px;">Réinitialisation du mot de passe</h2>
            <p>Vous avez demandé la réinitialisation de votre mot de passe Navventura.</p>
            <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.</p>
            <a href="${resetUrl}"
               style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Réinitialiser mon mot de passe
            </a>
            <p style="color: #6b7280; font-size: 14px;">
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail. Votre mot de passe ne sera pas modifié.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
              <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
            </p>
          </body>
          </html>
        `,
        text: `Réinitialisation du mot de passe Navventura\n\nCliquez sur ce lien pour réinitialiser votre mot de passe (valable 1 heure) :\n${resetUrl}\n\nSi vous n'avez pas fait cette demande, ignorez cet e-mail.`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${email} | ${getErrorDetails(err)}`,
      );
    }
  }

  async sendSyncSummary(
    recipients: string[],
    payload: {
      dateLabel: string;
      runs: SyncSummaryMailRun[];
    },
  ): Promise<void> {
    if (recipients.length === 0) return;

    const rowsHtml = payload.runs
      .map((run) => {
        const summaryEntries = Object.entries(run.summary)
          .filter(([, value]) => typeof value !== "object")
          .slice(0, 6)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" · ");

        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${run.source}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${run.status}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${run.durationMs ? `${Math.round(run.durationMs / 1000)} s` : "—"}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${summaryEntries || "—"}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${run.nextRetryAt ?? "—"}</td>
          </tr>
        `;
      })
      .join("");

    const rowsText = payload.runs
      .map((run) => {
        const summaryEntries = Object.entries(run.summary)
          .filter(([, value]) => typeof value !== "object")
          .slice(0, 6)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" | ");

        return `- ${run.source} | ${run.status} | durée: ${
          run.durationMs ? `${Math.round(run.durationMs / 1000)} s` : "—"
        } | ${summaryEntries || "pas de résumé"}${
          run.nextRetryAt ? ` | prochaine reprise: ${run.nextRetryAt}` : ""
        }${run.errorMessage ? ` | erreur: ${run.errorMessage}` : ""}`;
      })
      .join("\n");

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: recipients.join(", "),
        subject: `Récapitulatif des synchronisations Navventura — ${payload.dateLabel}`,
        html: `
          <!DOCTYPE html>
          <html lang="fr">
          <head><meta charset="UTF-8"></head>
          <body style="font-family:sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#111827;">
            <h2 style="margin-bottom:8px;">Récapitulatif des synchronisations</h2>
            <p style="color:#4b5563;">Exécutions nocturnes du ${payload.dateLabel}.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;">Source</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;">Statut</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;">Durée</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;">Résumé</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;">Prochaine reprise</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </body>
          </html>
        `,
        text: `Récapitulatif des synchronisations du ${payload.dateLabel}\n\n${rowsText}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send sync summary email | ${getErrorDetails(error)}`,
      );
    }
  }
}
