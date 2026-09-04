import { Global, Module } from '@nestjs/common';
import { OrganizationApiKeySecretService } from './organization-api-key-secret.service';

@Global()
@Module({
  providers: [OrganizationApiKeySecretService],
  exports: [OrganizationApiKeySecretService],
})
export class SecretsModule {}
