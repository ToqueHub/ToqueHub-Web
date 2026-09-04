import { ConfigService } from '@nestjs/config';
import { HrSensitiveDataCryptoService } from './hr-sensitive-data-crypto.service';

describe('HrSensitiveDataCryptoService', () => {
  it('encrypts personal identifiers without storing the clear value', () => {
    const config = new ConfigService({
      NODE_ENV: 'test',
      HR_SENSITIVE_DATA_ENCRYPTION_KEY: 'test-key-that-is-long-and-dedicated-to-hr-data',
    });
    const service = new HrSensitiveDataCryptoService(config);

    const encrypted = service.encrypt('080800A592P');

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('080800A592P');
    expect(service.decrypt(encrypted)).toBe('080800A592P');
  });
});
