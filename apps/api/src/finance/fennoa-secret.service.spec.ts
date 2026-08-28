import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FennoaSecretService } from './fennoa-secret.service';

const service = (values: Record<string, string>) =>
  new FennoaSecretService(new ConfigService(values));

describe('FennoaSecretService', () => {
  it('conserve la compatibilité avec JWT_SECRET en production', () => {
    const beforeRestart = service({ NODE_ENV: 'production', JWT_SECRET: 'stable-server-key' });
    const encrypted = beforeRestart.encrypt('loyverse-token');
    const afterRestart = service({ NODE_ENV: 'production', JWT_SECRET: 'stable-server-key' });

    expect(afterRestart.decrypt(encrypted)).toBe('loyverse-token');
  });

  it('utilise prioritairement la clé Finance dédiée', () => {
    const financeKey = service({
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-key',
      FINANCE_SECRETS_ENCRYPTION_KEY: 'finance-key',
    });
    const encrypted = financeKey.encrypt('paypal-api-key');

    expect(
      service({
        NODE_ENV: 'production',
        JWT_SECRET: 'another-jwt-key',
        FINANCE_SECRETS_ENCRYPTION_KEY: 'finance-key',
      }).decrypt(encrypted),
    ).toBe('paypal-api-key');
  });

  it('renvoie une erreur exploitable lorsque la clé serveur a changé', () => {
    const encrypted = service({ JWT_SECRET: 'old-key' }).encrypt('secret');

    expect(() => service({ JWT_SECRET: 'new-key' }).decrypt(encrypted)).toThrow(
      new ServiceUnavailableException(
        'Le secret Finance enregistré ne peut plus être déchiffré. Saisissez de nouveau le jeton ou la clé API pour rétablir cette connexion.',
      ),
    );
  });
});
