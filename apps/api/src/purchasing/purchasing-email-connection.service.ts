import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasingEmailConnectionStatus, PurchasingEmailProvider } from '@prisma/client';
import nodemailer from 'nodemailer';
import { createHash, randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationApiKeySecretService } from '../common/secrets/organization-api-key-secret.service';
import { PurchasingMailCryptoService } from './purchasing-mail-crypto.service';

type ConnectionDto = {
  provider: PurchasingEmailProvider;
  senderEmail?: string;
  senderName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string;
  smtpPassword?: string;
};
type OAuthConfig = { clientId: string; clientSecret: string; tenantId?: string };
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/gmail.send openid email';
const MICROSOFT_SCOPE = 'offline_access User.Read Mail.Send';

@Injectable()
export class PurchasingEmailConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PurchasingMailCryptoService,
    private readonly resendSecrets: OrganizationApiKeySecretService,
  ) {}

  async list(organizationId: string) {
    const connections = await this.prisma.purchasingEmailConnection.findMany({ where: { organizationId } });
    return connections.map((connection) => this.publicConnection(connection));
  }

  async configure(organizationId: string, dto: ConnectionDto) {
    if (dto.provider === PurchasingEmailProvider.SMTP) this.validateSmtp(dto);
    if (dto.provider !== PurchasingEmailProvider.RESEND && !dto.senderEmail?.trim())
      throw new BadRequestException('L’adresse d’envoi est requise.');
    const connection = await this.prisma.purchasingEmailConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: dto.provider } },
      create: {
        organizationId, provider: dto.provider, status: PurchasingEmailConnectionStatus.CONFIGURED,
        senderEmail: dto.senderEmail?.trim().toLowerCase() || null, senderName: dto.senderName?.trim() || null,
        smtpHost: dto.smtpHost?.trim() || null, smtpPort: dto.smtpPort ?? null, smtpSecure: dto.smtpSecure ?? true,
        smtpUsername: dto.smtpUsername?.trim() || null,
        secretCiphertext: dto.smtpPassword?.trim() ? this.crypto.encrypt(dto.smtpPassword.trim()) : null,
      },
      update: {
        status: PurchasingEmailConnectionStatus.CONFIGURED,
        senderEmail: dto.senderEmail?.trim().toLowerCase() || null, senderName: dto.senderName?.trim() || null,
        smtpHost: dto.smtpHost?.trim() || null, smtpPort: dto.smtpPort ?? null, smtpSecure: dto.smtpSecure ?? true,
        smtpUsername: dto.smtpUsername?.trim() || null,
        ...(dto.smtpPassword?.trim() ? { secretCiphertext: this.crypto.encrypt(dto.smtpPassword.trim()) } : {}),
        lastError: null,
      },
    });
    return this.publicConnection(connection);
  }

  async activate(organizationId: string, provider: PurchasingEmailProvider) {
    const connection = await this.require(organizationId, provider);
    if (provider === PurchasingEmailProvider.RESEND) {
      const secret = await this.resendSecrets.getResendSecret(organizationId);
      if (!secret) throw new BadRequestException('Configurez la clé API Resend avant de l’activer.');
    } else if (connection.status !== PurchasingEmailConnectionStatus.CONNECTED) {
      throw new BadRequestException('Testez la messagerie avant de l’activer.');
    }
    await this.prisma.purchasingSettings.upsert({ where: { organizationId }, create: { organizationId, activeEmailProvider: provider }, update: { activeEmailProvider: provider } });
    return this.list(organizationId);
  }

  async disconnect(organizationId: string, provider: PurchasingEmailProvider) {
    await this.prisma.purchasingEmailConnection.updateMany({
      where: { organizationId, provider },
      data: { status: PurchasingEmailConnectionStatus.DISCONNECTED, secretCiphertext: null, oauthRefreshToken: null, oauthAccountId: null, lastError: null },
    });
    await this.prisma.purchasingSettings.updateMany({ where: { organizationId, activeEmailProvider: provider }, data: { activeEmailProvider: null } });
    return this.list(organizationId);
  }

  async test(organizationId: string, provider: PurchasingEmailProvider) {
    const connection = await this.require(organizationId, provider);
    try {
      if (provider === PurchasingEmailProvider.SMTP) {
        const transport = this.smtpTransport(connection);
        await transport.verify();
        if (!connection.senderEmail) throw new BadRequestException('Adresse d’envoi SMTP introuvable.');
        await transport.sendMail({ from: this.from(connection), to: connection.senderEmail, subject: 'Test ToqueHub Achats', text: 'Connexion SMTP validée. Cette boîte peut envoyer les commandes fournisseurs.' });
      } else if (provider === PurchasingEmailProvider.RESEND) {
        // Resend is tested by the existing endpoint until it is fully migrated.
        throw new BadRequestException('Utilisez le test Resend existant pour cette connexion.');
      } else {
        await this.oauthAccessToken(connection);
      }
      const updated = await this.prisma.purchasingEmailConnection.update({ where: { id: connection.id }, data: { status: PurchasingEmailConnectionStatus.CONNECTED, lastTestedAt: new Date(), lastError: null } });
      return this.publicConnection(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Test de messagerie impossible.';
      await this.prisma.purchasingEmailConnection.update({ where: { id: connection.id }, data: { status: PurchasingEmailConnectionStatus.ERROR, lastTestedAt: new Date(), lastError: message } });
      throw new BadRequestException(message);
    }
  }

  async startOAuth(organizationId: string, provider: PurchasingEmailProvider) {
    if (provider !== PurchasingEmailProvider.GOOGLE && provider !== PurchasingEmailProvider.MICROSOFT)
      throw new BadRequestException('Ce fournisseur ne se connecte pas via OAuth.');
    throw new BadRequestException('Utilisez le démarrage OAuth associé à votre session.');
  }

  async startOAuthForUser(organizationId: string, userId: string, provider: PurchasingEmailProvider, requestOrigin?: string) {
    if (provider !== PurchasingEmailProvider.GOOGLE && provider !== PurchasingEmailProvider.MICROSOFT)
      throw new BadRequestException('Ce fournisseur ne se connecte pas via OAuth.');
    const state = randomBytes(32).toString('base64url');
    const broker = this.brokerUrl();
    const redirectUri = broker ? `${this.resolvePublicBaseUrl(requestOrigin)}/api/purchasing/oauth/broker/callback` : await this.callbackUrl(provider, requestOrigin);
    await this.prisma.purchasingEmailOAuthState.create({ data: { organizationId, userId, provider, redirectUri, stateHash: this.hash(state), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    if (broker) return { url: `${broker}/api/oauth-broker/connect?${new URLSearchParams({ provider, returnUrl: redirectUri, state }).toString()}` };
    const config = await this.oauthConfig(provider);
    if (provider === PurchasingEmailProvider.GOOGLE) {
      const oauth = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
      return { url: oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPE.split(' '), state }) };
    }
    const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: MICROSOFT_SCOPE, state });
    return { url: `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId || 'common')}/oauth2/v2.0/authorize?${query}` };
  }

  async completeOAuth(code: string, state: string, expectedProvider: PurchasingEmailProvider) {
    const pending = await this.prisma.purchasingEmailOAuthState.findUnique({ where: { stateHash: this.hash(state) } });
    if (!pending || pending.consumedAt || pending.expiresAt.getTime() < Date.now())
      throw new BadRequestException('Session de connexion expirée ou invalide. Recommencez la connexion.');
    if (pending.provider !== expectedProvider) throw new BadRequestException('Le fournisseur OAuth ne correspond pas à la session de connexion.');
    await this.prisma.purchasingEmailOAuthState.update({ where: { id: pending.id }, data: { consumedAt: new Date() } });
    const config = await this.oauthConfig(pending.provider);
    const redirectUri = pending.redirectUri;
    let refreshToken: string | null = null;
    let senderEmail: string | null = null;
    let senderName: string | null = null;
    if (pending.provider === PurchasingEmailProvider.GOOGLE) {
      const oauth = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
      const { tokens } = await oauth.getToken(code);
      refreshToken = tokens.refresh_token || null;
      if (!refreshToken) throw new BadRequestException('Google n’a pas renvoyé de jeton durable. Reconnectez la boîte en acceptant le consentement.');
      oauth.setCredentials(tokens);
      const profile = await google.oauth2({ version: 'v2', auth: oauth }).userinfo.get();
      senderEmail = profile.data.email ?? null;
      senderName = profile.data.name ?? null;
    } else {
      const token = await this.microsoftToken(config, { code, redirectUri });
      refreshToken = token.refresh_token || null;
      if (!refreshToken) throw new BadRequestException('Microsoft n’a pas renvoyé de jeton durable.');
      const profile = await this.microsoftProfile(token.access_token);
      senderEmail = profile.mail || profile.userPrincipalName || null;
      senderName = profile.displayName || null;
    }
    if (!senderEmail) throw new BadRequestException('Impossible d’identifier l’adresse de la boîte connectée.');
    const connection = await this.prisma.purchasingEmailConnection.upsert({
      where: { organizationId_provider: { organizationId: pending.organizationId, provider: pending.provider } },
      create: { organizationId: pending.organizationId, provider: pending.provider, status: PurchasingEmailConnectionStatus.CONNECTED, senderEmail, senderName, oauthRefreshToken: this.crypto.encrypt(refreshToken), oauthAccountId: senderEmail, lastTestedAt: new Date() },
      update: { status: PurchasingEmailConnectionStatus.CONNECTED, senderEmail, senderName, oauthRefreshToken: this.crypto.encrypt(refreshToken), oauthAccountId: senderEmail, lastTestedAt: new Date(), lastError: null },
    });
    await this.prisma.purchasingSettings.upsert({ where: { organizationId: pending.organizationId }, create: { organizationId: pending.organizationId, activeEmailProvider: pending.provider }, update: { activeEmailProvider: pending.provider } });
    return this.publicConnection(connection);
  }

  async completeBrokerOAuth(grant: string, state: string) {
    const pending = await this.prisma.purchasingEmailOAuthState.findUnique({ where: { stateHash: this.hash(state) } });
    if (!pending || pending.consumedAt || pending.expiresAt.getTime() < Date.now()) throw new BadRequestException('Session de connexion expirée ou invalide.');
    const broker = this.brokerUrl();
    const response = await fetch(`${broker}/api/oauth-broker/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant, state }) });
    const payload = await response.json().catch(() => ({})) as { provider?: PurchasingEmailProvider; refreshToken?: string; senderEmail?: string; senderName?: string; message?: string };
    if (!response.ok || payload.provider !== pending.provider || !payload.refreshToken || !payload.senderEmail) throw new BadRequestException(payload.message || 'Autorisation ToqueHub invalide.');
    await this.prisma.purchasingEmailOAuthState.update({ where: { id: pending.id }, data: { consumedAt: new Date() } });
    const connection = await this.prisma.purchasingEmailConnection.upsert({ where: { organizationId_provider: { organizationId: pending.organizationId, provider: pending.provider } }, create: { organizationId: pending.organizationId, provider: pending.provider, status: PurchasingEmailConnectionStatus.CONNECTED, senderEmail: payload.senderEmail, senderName: payload.senderName || null, oauthRefreshToken: this.crypto.encrypt(payload.refreshToken), oauthAccountId: payload.senderEmail, lastTestedAt: new Date() }, update: { status: PurchasingEmailConnectionStatus.CONNECTED, senderEmail: payload.senderEmail, senderName: payload.senderName || null, oauthRefreshToken: this.crypto.encrypt(payload.refreshToken), oauthAccountId: payload.senderEmail, lastTestedAt: new Date(), lastError: null } });
    await this.prisma.purchasingSettings.upsert({ where: { organizationId: pending.organizationId }, create: { organizationId: pending.organizationId, activeEmailProvider: pending.provider }, update: { activeEmailProvider: pending.provider } });
    return this.publicConnection(connection);
  }

  async configureOAuth(provider: PurchasingEmailProvider, dto: { clientId: string; clientSecret?: string; tenantId?: string }, requestOrigin?: string) {
    if (provider !== PurchasingEmailProvider.GOOGLE && provider !== PurchasingEmailProvider.MICROSOFT) throw new BadRequestException('Fournisseur OAuth invalide.');
    const current = await this.oauthConfigRecord(provider);
    if (!dto.clientSecret && !current) throw new BadRequestException('Le secret OAuth est requis lors de la première configuration.');
    const value = { clientId: dto.clientId.trim(), clientSecret: dto.clientSecret?.trim() ? this.crypto.encrypt(dto.clientSecret.trim()) : current?.clientSecret, tenantId: dto.tenantId?.trim() || 'common' };
    await this.prisma.systemSetting.upsert({ where: { key: this.oauthKey(provider) }, create: { key: this.oauthKey(provider), value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
    const base = this.resolvePublicBaseUrl(requestOrigin);
    await this.prisma.systemSetting.upsert({ where: { key: 'purchasing-oauth-public-url' }, create: { key: 'purchasing-oauth-public-url', value: base }, update: { value: base } });
    return { provider, configured: true, clientId: value.clientId, redirectUri: `${base}/api/purchasing/oauth/${provider.toLowerCase()}/callback` };
  }

  async oauthStatus(provider: PurchasingEmailProvider, requestOrigin?: string) {
    const record = await this.oauthConfigRecord(provider);
    return { provider, configured: Boolean(record), clientId: record?.clientId ?? null, redirectUri: await this.callbackUrl(provider, requestOrigin) };
  }

  async active(organizationId: string) {
    const settings = await this.prisma.purchasingSettings.findUnique({ where: { organizationId } });
    if (!settings?.activeEmailProvider) return null;
    return this.require(organizationId, settings.activeEmailProvider);
  }

  async send(input: { organizationId: string; recipient: string; subject: string; text: string; pdf: Buffer; filename: string; }) {
    const connection = await this.active(input.organizationId);
    if (!connection) throw new BadRequestException('Connectez puis activez une messagerie avant l’envoi.');
    if (connection.provider === PurchasingEmailProvider.SMTP) {
      const result = await this.smtpTransport(connection).sendMail({ from: this.from(connection), to: input.recipient, subject: input.subject, text: input.text, attachments: [{ filename: input.filename, content: input.pdf }] });
      return { provider: connection.provider, messageId: result.messageId || null, fromEmail: connection.senderEmail!, fromName: connection.senderName || null };
    }
    if (connection.provider === PurchasingEmailProvider.GOOGLE) {
      const accessToken = await this.oauthAccessToken(connection);
      const message = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail({ from: this.from(connection), to: input.recipient, subject: input.subject, text: input.text, attachments: [{ filename: input.filename, content: input.pdf }] });
      const raw = Buffer.from(message.message as Buffer).toString('base64url');
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
      const result = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
      if (!response.ok) throw new BadRequestException(result.error?.message || 'Google a refusé l’envoi.');
      return { provider: connection.provider, messageId: result.id || null, fromEmail: connection.senderEmail!, fromName: connection.senderName || null };
    }
    if (connection.provider === PurchasingEmailProvider.MICROSOFT) {
      const accessToken = await this.oauthAccessToken(connection);
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { subject: input.subject, body: { contentType: 'Text', content: input.text }, toRecipients: [{ emailAddress: { address: input.recipient } }], attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: input.filename, contentBytes: input.pdf.toString('base64') }] }, saveToSentItems: true }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new BadRequestException(result.error?.message || 'Microsoft a refusé l’envoi.'); }
      return { provider: connection.provider, messageId: null, fromEmail: connection.senderEmail!, fromName: connection.senderName || null };
    }
    throw new BadRequestException(`Le connecteur ${connection.provider} n’est pas encore autorisé à envoyer depuis cette instance.`);
  }

  private smtpTransport(connection: any) {
    const password = this.crypto.decrypt(connection.secretCiphertext);
    if (!password || !connection.smtpHost || !connection.smtpPort || !connection.smtpUsername) throw new BadRequestException('Configuration SMTP incomplète.');
    return nodemailer.createTransport({ host: connection.smtpHost, port: connection.smtpPort, secure: connection.smtpSecure, auth: { user: connection.smtpUsername, pass: password }, tls: { minVersion: 'TLSv1.2' } });
  }
  private from(connection: any) { return connection.senderName ? `${connection.senderName.replace(/[<>\r\n]/g, '')} <${connection.senderEmail}>` : connection.senderEmail; }
  private validateSmtp(dto: ConnectionDto) { if (!dto.smtpHost || !dto.smtpPort || !dto.smtpUsername || !dto.smtpPassword) throw new BadRequestException('Serveur, port, identifiant et mot de passe d’application SMTP requis.'); }
  private async require(organizationId: string, provider: PurchasingEmailProvider) { const item = await this.prisma.purchasingEmailConnection.findUnique({ where: { organizationId_provider: { organizationId, provider } } }); if (!item) throw new NotFoundException('Connexion e-mail introuvable.'); return item; }
  private publicConnection(connection: any) { return { id: connection.id, provider: connection.provider, status: connection.status, senderEmail: connection.senderEmail, senderName: connection.senderName, smtpHost: connection.smtpHost, smtpPort: connection.smtpPort, smtpSecure: connection.smtpSecure, smtpUsername: connection.smtpUsername, configured: Boolean(connection.secretCiphertext || connection.oauthRefreshToken || connection.provider === PurchasingEmailProvider.RESEND), lastTestedAt: connection.lastTestedAt, lastError: connection.lastError }; }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private brokerUrl() { return process.env.TOQUEHUB_OAUTH_BROKER_URL?.trim().replace(/\/$/, '') || 'https://oauth.toquehub.app'; }
  private oauthKey(provider: PurchasingEmailProvider) { return `purchasing-oauth-${provider.toLowerCase()}`; }
  private async callbackUrl(provider: PurchasingEmailProvider, requestOrigin?: string) { const base = requestOrigin ? this.resolvePublicBaseUrl(requestOrigin) : process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') || (await this.prisma.systemSetting.findUnique({ where: { key: 'purchasing-oauth-public-url' } }))?.value; if (!base) throw new BadRequestException('Ouvrez ToqueHub depuis son adresse publique pour initialiser automatiquement OAuth.'); return `${base}/api/purchasing/oauth/${provider.toLowerCase()}/callback`; }
  private resolvePublicBaseUrl(origin?: string) { const raw = origin?.trim(); if (!raw) throw new BadRequestException('Impossible de détecter l’adresse publique de ToqueHub.'); try { const url = new URL(raw); if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(); return url.origin; } catch { throw new BadRequestException('Adresse publique ToqueHub invalide.'); } }
  private async oauthConfigRecord(provider: PurchasingEmailProvider): Promise<{ clientId: string; clientSecret: string; tenantId?: string } | null> { const record = await this.prisma.systemSetting.findUnique({ where: { key: this.oauthKey(provider) } }); return record ? JSON.parse(record.value) : null; }
  private async oauthConfig(provider: PurchasingEmailProvider): Promise<OAuthConfig> { const envPrefix = provider === PurchasingEmailProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT'; const clientId = process.env[`${envPrefix}_OAUTH_CLIENT_ID`]?.trim(); const secret = process.env[`${envPrefix}_OAUTH_CLIENT_SECRET`]?.trim(); if (clientId && secret) return { clientId, clientSecret: secret, tenantId: process.env.MICROSOFT_OAUTH_TENANT_ID?.trim() || 'common' }; const stored = await this.oauthConfigRecord(provider); if (!stored) throw new BadRequestException(`Configurez ${provider === PurchasingEmailProvider.GOOGLE ? 'Google' : 'Microsoft'} dans les réglages super-admin avant de connecter une boîte.`); return { clientId: stored.clientId, clientSecret: this.crypto.decrypt(stored.clientSecret)!, tenantId: stored.tenantId || 'common' }; }
  private async microsoftToken(config: OAuthConfig, input: { code?: string; refreshToken?: string; redirectUri?: string }) { const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: MICROSOFT_SCOPE, grant_type: input.code ? 'authorization_code' : 'refresh_token', ...(input.code ? { code: input.code, redirect_uri: input.redirectUri! } : { refresh_token: input.refreshToken! }) }); const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId || 'common')}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const result = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; error_description?: string }; if (!response.ok || !result.access_token) throw new BadRequestException(result.error_description || 'Microsoft n’a pas renvoyé de jeton.'); return result as { access_token: string; refresh_token?: string }; }
  private async microsoftProfile(accessToken: string) { const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', { headers: { Authorization: `Bearer ${accessToken}` } }); if (!response.ok) throw new BadRequestException('Impossible d’identifier le compte Microsoft.'); return response.json() as Promise<{ mail?: string; userPrincipalName?: string; displayName?: string }>; }
  private async oauthAccessToken(connection: any) { const refreshToken = this.crypto.decrypt(connection.oauthRefreshToken); if (!refreshToken) throw new BadRequestException('Connexion e-mail expirée. Reconnectez la boîte.'); const config = await this.oauthConfig(connection.provider); if (connection.provider === PurchasingEmailProvider.GOOGLE) { const oauth = new google.auth.OAuth2(config.clientId, config.clientSecret); oauth.setCredentials({ refresh_token: refreshToken }); const token = await oauth.getAccessToken(); if (!token.token) throw new BadRequestException('Google n’a pas renvoyé de jeton d’accès.'); return token.token; } const token = await this.microsoftToken(config, { refreshToken }); if (token.refresh_token && token.refresh_token !== refreshToken) await this.prisma.purchasingEmailConnection.update({ where: { id: connection.id }, data: { oauthRefreshToken: this.crypto.encrypt(token.refresh_token) } }); return token.access_token; }
}
