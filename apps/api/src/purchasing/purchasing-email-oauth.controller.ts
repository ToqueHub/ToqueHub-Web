import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PurchasingEmailConnectionService } from './purchasing-email-connection.service';
import { PurchasingEmailProvider } from '@prisma/client';

@Controller('purchasing/oauth')
export class PurchasingEmailOAuthController {
  constructor(private readonly connections: PurchasingEmailConnectionService) {}

  @Get('google/callback') google(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string | undefined, @Res() response: Response) { return this.callback(PurchasingEmailProvider.GOOGLE, code, state, error, response); }
  @Get('microsoft/callback') microsoft(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string | undefined, @Res() response: Response) { return this.callback(PurchasingEmailProvider.MICROSOFT, code, state, error, response); }
  @Get('broker/callback') async broker(@Query('grant') grant: string, @Query('state') state: string, @Query('error_description') error: string | undefined, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    try { if (error) throw new Error(error); if (!grant || !state) throw new Error('Autorisation ToqueHub incomplète.'); await this.connections.completeBrokerOAuth(grant, state); return response.send(this.html('Messagerie connectée', 'Vous pouvez fermer cette fenêtre et revenir dans ToqueHub.', true)); }
    catch (err) { return response.send(this.html('Connexion impossible', err instanceof Error ? err.message : 'Erreur OAuth.', false)); }
  }

  private async callback(provider: PurchasingEmailProvider, code: string, state: string, error: string | undefined, response: Response) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    try {
      if (error) throw new Error(error);
      if (!code || !state) throw new Error('Code ou état OAuth manquant.');
      await this.connections.completeOAuth(code, state, provider);
      return response.send(this.html(`${provider} connecté`, 'Vous pouvez fermer cette fenêtre et revenir dans ToqueHub.', true));
    } catch (err) { return response.send(this.html(`Connexion ${provider} impossible`, err instanceof Error ? err.message : 'Erreur OAuth.', false)); }
  }
  private html(title: string, message: string, ok: boolean) { const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char); return `<!doctype html><html lang="fr"><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="max-width:460px;text-align:center"><h1>${escape(title)}</h1><p>${escape(message)}</p></main><script>if(window.opener)window.opener.postMessage({type:'toquehub:purchasing-email',ok:${ok}},'*');</script></body></html>`; }
}
