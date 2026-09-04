import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FennoaCredentials = {
  baseUrl: string;
  username: string;
  apiKey: string;
  apiVersion: string;
};

type FennoaEnvelope = {
  status?: boolean | string;
  data?: unknown;
  message?: string;
  error?: string;
  pagination?: Record<string, unknown>;
};

export function unwrapFennoaData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const envelope = payload as FennoaEnvelope;
  const status =
    typeof envelope.status === 'string' ? envelope.status.toLowerCase() : envelope.status;
  if (status === false || status === 'error') {
    throw new BadGatewayException(
      envelope.message || envelope.error || 'Fennoa a refusé la requête.',
    );
  }
  return envelope.data ?? payload;
}

export function normalizeFennoaBaseUrl(value: string) {
  const url = new URL(value.trim().replace(/\/+$/, ''));
  if (url.protocol !== 'https:') throw new BadRequestException('Fennoa doit être appelé en HTTPS.');
  return url.toString().replace(/\/+$/, '');
}

@Injectable()
export class FennoaClientService {
  constructor(private readonly config: ConfigService) {}

  async test(credentials: FennoaCredentials) {
    const [accounts, periods] = await Promise.all([
      this.accounts(credentials),
      this.periods(credentials),
    ]);
    return { accountsCount: accounts.length, periodsCount: periods.length };
  }

  accounts(credentials: FennoaCredentials) {
    return this.requestArray(credentials, 'accounting_api/get/accounts');
  }

  periods(credentials: FennoaCredentials) {
    return this.requestArray(credentials, 'accounting_api/get/periods');
  }

  lockingPeriods(credentials: FennoaCredentials) {
    return this.requestArray(credentials, 'accounting_api/get/locking_periods');
  }

  budgets(credentials: FennoaCredentials, accountingPeriodId: number) {
    return this.requestArray(
      credentials,
      `accounting_api/get/budgets?accountingPeriodId=${encodeURIComponent(accountingPeriodId)}`,
    );
  }

  customers(credentials: FennoaCredentials, modifiedAfter?: string) {
    const query = modifiedAfter ? `?modifiedAfter=${encodeURIComponent(modifiedAfter)}` : '';
    return this.requestArray(credentials, `customer_api/${query}`);
  }

  async salesInvoices(credentials: FennoaCredentials) {
    const rows: unknown[] = [];
    const pageSize = 200;
    for (let page = 1; page <= 2000; page += 1) {
      const response = await this.request(credentials, `sales_api/?page=${page}`);
      const pageRows = this.asArray(unwrapFennoaData(response));
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }
    return rows;
  }

  async ledger(credentials: FennoaCredentials, start: string, end: string) {
    const rows: unknown[] = [];
    const limit = 500;
    for (let page = 1; page <= 2000; page += 1) {
      const response = await this.request(
        credentials,
        `accounting_api/get/ledger/${encodeURIComponent(start)}/${encodeURIComponent(end)}?page=${page}&limit=${limit}`,
      );
      const pageRows = this.asArray(unwrapFennoaData(response));
      rows.push(...pageRows);
      const pagination =
        response && typeof response === 'object' && !Array.isArray(response)
          ? (response as FennoaEnvelope).pagination
          : undefined;
      const pageCount = Number(
        pagination?.pagesCount ??
          pagination?.pages ??
          pagination?.pageCount ??
          pagination?.lastPage ??
          0,
      );
      if ((pageCount && page >= pageCount) || pageRows.length < limit) break;
    }
    return rows;
  }

  private async requestArray(credentials: FennoaCredentials, path: string) {
    return this.asArray(unwrapFennoaData(await this.request(credentials, path)));
  }

  private asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      for (const key of [
        'rows',
        'items',
        'accounts',
        'periods',
        'budgets',
        'ledger',
        'customers',
        'Customer',
        'salesInvoices',
        'SalesInvoices',
        'invoices',
      ]) {
        const candidate = (value as Record<string, unknown>)[key];
        if (Array.isArray(candidate)) return candidate;
      }
    }
    return [];
  }

  private async request(credentials: FennoaCredentials, path: string): Promise<unknown> {
    if (credentials.apiVersion !== 'v1') {
      throw new BadRequestException(
        'Le connecteur Fennoa v2 est préparé mais la section Accounting v2 n’est pas encore activée pour cette instance.',
      );
    }
    const baseUrl = normalizeFennoaBaseUrl(credentials.baseUrl);
    this.assertAllowedHost(baseUrl);
    const url = `${baseUrl}/${path.replace(/^\/+/, '')}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.apiKey}`).toString('base64')}`,
          'User-Agent': 'ToqueHub-Finance/1.0',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new BadGatewayException(
        `Fennoa est injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Identifiant ou clé API Fennoa invalide.');
    }
    const raw = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `Fennoa a répondu ${response.status}${raw ? ` : ${raw.slice(0, 300)}` : ''}`,
      );
    }
    if (!raw) return [];
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new BadGatewayException('Fennoa a renvoyé une réponse non JSON.');
    }
  }

  private assertAllowedHost(baseUrl: string) {
    const host = new URL(baseUrl).hostname.toLowerCase();
    const isFennoa = host === 'fennoa.com' || host.endsWith('.fennoa.com');
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!isFennoa && !(isLocal && this.config.get<string>('NODE_ENV') !== 'production')) {
      throw new BadRequestException('L’URL API doit appartenir au domaine fennoa.com.');
    }
  }
}
