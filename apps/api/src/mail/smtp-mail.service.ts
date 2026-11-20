import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { AppConfigService } from "../config/config.service";
import type { MailService, SendMailInput } from "./mail.types";

@Injectable()
export class SmtpMailService implements MailService, OnModuleDestroy {
  private readonly transporter: Transporter;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    const secure = config.smtpSecure;
    this.transporter = nodemailer.createTransport({
      pool: true,
      host: config.smtpHost,
      port: config.smtpPort,
      secure,
      ...(secure
        ? {}
        : {
            requireTLS: false,
            ignoreTLS: config.smtpPort === 1025,
          }),
      auth: config.smtpUser
        ? {
            user: config.smtpUser,
            pass: config.smtpPassword,
          }
        : undefined,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }

  async send(input: SendMailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.smtpFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
  }
}
