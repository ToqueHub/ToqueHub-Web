import { BadRequestException, Injectable } from '@nestjs/common';
import { OrganizationApiKeySecretService } from '../common/secrets/organization-api-key-secret.service';
import type {
  PurchaseOrderEmailDocument,
  PurchasingEmailSettings,
  PurchasingEmailTransport,
} from './purchasing-email.transport';

type ResendResponse = { id?: string; message?: string; name?: string };

@Injectable()
export class ResendPurchasingGateway implements PurchasingEmailTransport {
  constructor(private readonly secrets: OrganizationApiKeySecretService) {}

  async verify(settings: PurchasingEmailSettings, organizationId: string) {
    if (!settings.fromEmail)
      throw new BadRequestException('L’adresse d’envoi Resend n’est pas configurée.');
    const fromName = this.safeHeader(settings.fromName?.trim() || 'ToqueHub Achats');
    const result = await this.sendEmail(
      organizationId,
      {
        from: `${fromName} <${settings.fromEmail}>`,
        to: ['delivered@resend.dev'],
        reply_to: settings.replyTo || settings.fromEmail,
        subject: 'Test de connexion Resend — ToqueHub Achats',
        text: 'La clé API et l’adresse d’envoi Resend sont correctement connectées au module Achats ToqueHub.',
        tags: [{ name: 'module', value: 'purchasing' }],
      },
      `purchasing-resend-test-${organizationId}-${Date.now()}`,
    );
    return { configured: true, verifiedAt: new Date().toISOString(), emailId: result.id };
  }

  async sendOrder(
    settings: PurchasingEmailSettings,
    order: PurchaseOrderEmailDocument,
    pdf: Buffer,
    recipient: string,
    idempotencyKey: string,
  ) {
    if (!settings.fromEmail)
      throw new BadRequestException('L’adresse d’envoi Resend n’est pas configurée.');
    const subject = `Commande ${order.number} — ${order.organization?.name ?? 'ToqueHub'}`;
    const fromName = this.safeHeader(
      settings.fromName?.trim() || order.organization?.name || 'ToqueHub',
    );
    const result = await this.sendEmail(
      order.organizationId,
      {
        from: `${fromName} <${settings.fromEmail}>`,
        to: [recipient],
        reply_to: settings.replyTo || settings.fromEmail,
        subject,
        text: this.textBody(order),
        attachments: [{ filename: `${order.number}.pdf`, content: pdf.toString('base64') }],
        tags: [
          { name: 'module', value: 'purchasing' },
          { name: 'order', value: order.number.replace(/[^a-zA-Z0-9_-]/g, '-') },
        ],
      },
      idempotencyKey,
    );
    return { messageId: result.id ?? null, subject };
  }

  private async sendEmail(
    organizationId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ResendResponse> {
    const apiKey = await this.secrets.getResendSecret(organizationId);
    if (!apiKey) throw new BadRequestException('La clé API Resend n’est pas configurée.');
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'User-Agent': 'ToqueHub-Purchasing/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resend indisponible';
      throw new BadRequestException(`Connexion à Resend impossible : ${message}`);
    }
    const result = (await response.json().catch(() => ({}))) as ResendResponse;
    if (!response.ok)
      throw new BadRequestException(
        `Resend a refusé l’envoi : ${result.message || result.name || `HTTP ${response.status}`}`,
      );
    return result;
  }

  private safeHeader(value: string) {
    return value.replace(/[<>\r\n]/g, '').trim() || 'ToqueHub';
  }

  private textBody(order: PurchaseOrderEmailDocument) {
    return [
      'Bonjour,',
      '',
      `Veuillez trouver en pièce jointe notre commande ${order.number}.`,
      order.expectedDeliveryDate
        ? `Date de livraison souhaitée : ${new Date(order.expectedDeliveryDate).toLocaleDateString('fr-FR')}.`
        : 'Livraison souhaitée au plus tôt.',
      order.supplierMessage || '',
      '',
      `Total TTC : ${Number(order.totalIncludingTax).toFixed(2)} ${order.currency}`,
      '',
      'Cordialement,',
      order.organization?.name || 'ToqueHub',
    ]
      .filter((line, index, all) => line || all[index - 1] !== '')
      .join('\n');
  }
}
