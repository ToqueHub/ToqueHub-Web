import {
  ClientHttp2Stream,
  connect,
  constants,
  IncomingHttpHeaders,
} from 'node:http2';

const MISTRAL_ORIGIN = 'https://api.mistral.ai';
const MISTRAL_OCR_PATH = '/v1/ocr';
export const DEFAULT_MISTRAL_OCR_TIMEOUT_MS = 120_000;

export type MistralOcrHttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

type TransportError = Error & { code?: string; cause?: unknown };

export function postMistralOcr(
  apiKey: string,
  body: unknown,
  timeoutMs = DEFAULT_MISTRAL_OCR_TIMEOUT_MS,
): Promise<MistralOcrHttpResponse> {
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const session = connect(MISTRAL_ORIGIN);
    let request: ClientHttp2Stream | undefined;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      session.removeListener('error', fail);
    };
    const succeed = (value: MistralOcrHttpResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      session.close();
      resolve(value);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      request?.close(constants.NGHTTP2_CANCEL);
      session.destroy();
      const error: TransportError =
        reason instanceof Error ? reason : new Error(String(reason || 'Erreur HTTP/2 Mistral'));
      reject(error);
    };
    const timeout = setTimeout(() => {
      const error: TransportError = new Error(
        `Délai OCR Mistral dépassé après ${timeoutMs} ms`,
      );
      error.code = 'MISTRAL_OCR_TIMEOUT';
      fail(error);
    }, timeoutMs);

    session.once('error', fail);
    request = session.request({
      [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_POST,
      [constants.HTTP2_HEADER_PATH]: MISTRAL_OCR_PATH,
      [constants.HTTP2_HEADER_AUTHORIZATION]: `Bearer ${apiKey}`,
      [constants.HTTP2_HEADER_CONTENT_TYPE]: 'application/json',
      [constants.HTTP2_HEADER_CONTENT_LENGTH]: Buffer.byteLength(payload),
    });

    let status = 0;
    const chunks: Buffer[] = [];
    request.on('response', (headers: IncomingHttpHeaders) => {
      status = Number(headers[constants.HTTP2_HEADER_STATUS] || 0);
    });
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.once('aborted', () => {
      const error: TransportError = new Error('Flux HTTP/2 Mistral interrompu');
      error.code = 'MISTRAL_OCR_STREAM_ABORTED';
      fail(error);
    });
    request.once('error', fail);
    request.once('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: any = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { message: raw.slice(0, 1_000) };
        }
      }
      succeed({
        ok: status >= 200 && status < 300,
        status,
        json: async () => parsed,
      });
    });
    request.end(payload);
  });
}
