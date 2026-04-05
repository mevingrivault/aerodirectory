import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>("MAIL_FROM", "Navventura <noreply@navventura.fr>");

    this.appUrl =
      this.config.get<string>("APP_URL") ||
      this.config.get<string>("FRONTEND_URL") ||
      (this.config.get<string>("NODE_ENV") === "production"
        ? "https://navventura.fr"
        : "http://localhost:3000");

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST", "localhost"),
      port: this.config.get<number>("SMTP_PORT", 587),
      secure: this.config.get<boolean>("SMTP_SECURE", false),
      auth: {
        user: this.config.get<string>("SMTP_USER"),
        pass: this.config.get<string>("SMTP_PASS"),
      },
    });
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
      this.logger.error(`Failed to send password reset email to ${email}`, err);
      // Ne pas remonter l'erreur : la réponse API reste générique
    }
  }
}
