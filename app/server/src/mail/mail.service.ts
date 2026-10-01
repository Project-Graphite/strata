import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

export class MailDeliveryError extends Error {
  readonly code?: string;
  readonly responseCode?: number;
  readonly command?: string;

  constructor(cause: unknown) {
    const { code, responseCode, command } = (cause ?? {}) as Record<string, unknown>;
    const details = [
      typeof code === 'string' ? code : undefined,
      typeof responseCode === 'number' ? `SMTP ${responseCode}` : undefined,
      typeof command === 'string' ? command : undefined,
    ].filter((detail) => detail !== undefined);
    super(`Email delivery failed (${details.join(', ') || 'unknown error'})`);
    this.name = 'MailDeliveryError';
    this.code = typeof code === 'string' ? code : undefined;
    this.responseCode = typeof responseCode === 'number' ? responseCode : undefined;
    this.command = typeof command === 'string' ? command : undefined;
  }
}

@Injectable()
export class MailService {
  private transport?: Transporter;

  constructor(private readonly config: ConfigService) {}

  get configured() {
    return Boolean(this.config.get<string>('EMAIL_HOST'));
  }

  link(path: string) {
    return new URL(path, this.config.getOrThrow<string>('APP_URL')).toString();
  }

  async send(message: MailMessage) {
    if (!this.configured) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }
    this.transport ??= this.createTransport();
    try {
      await this.transport.sendMail({
        from: this.config.getOrThrow<string>('DEFAULT_FROM_EMAIL'),
        ...message,
      });
    } catch (error) {
      throw new MailDeliveryError(error);
    }
  }

  private createTransport() {
    const port = Number(this.config.get<string>('EMAIL_PORT') ?? 587);
    const user = this.config.get<string>('EMAIL_HOST_USER');
    return createTransport({
      host: this.config.getOrThrow<string>('EMAIL_HOST'),
      port,
      secure: port === 465,
      requireTLS: Boolean(user) && port !== 465,
      auth: user ? { user, pass: this.config.get<string>('EMAIL_HOST_PASSWORD') } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
}
