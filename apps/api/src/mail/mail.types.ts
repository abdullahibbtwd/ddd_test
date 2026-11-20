export type MailAttachmentRef = {
  filename: string;
  storageKey: string;
};

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
  replyTo?: string;
};

export type EnqueueMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachmentRef[];
  replyTo?: string;
};

export const MAIL_SERVICE = Symbol("MAIL_SERVICE");

export interface MailService {
  send(input: SendMailInput): Promise<void>;
}
