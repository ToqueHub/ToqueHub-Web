import { ResendPurchasingGateway } from './resend-purchasing.gateway';

function service(secret: string | null = 're_test_secret') {
  return new ResendPurchasingGateway({
    getResendSecret: jest.fn().mockResolvedValue(secret),
  } as never);
}

describe('ResendPurchasingGateway', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tests the key with the official Resend test recipient and an idempotency key', async () => {
    const resend = service();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-test-id' }),
    } as Response);

    const result = await resend.verify(
      {
        fromEmail: 'achats@example.com',
        fromName: 'ToqueHub Achats',
        replyTo: 'commandes@example.com',
      },
      'org-1',
    );

    expect(result.emailId).toBe('email-test-id');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_secret',
          'Idempotency-Key': expect.stringContaining('purchasing-resend-test-org-1'),
          'User-Agent': 'ToqueHub-Purchasing/1.0',
        }),
        body: expect.stringContaining('delivered@resend.dev'),
      }),
    );
    expect(fetchMock.mock.calls[0][1]?.body).toContain('ToqueHub Achats <achats@example.com>');
  });

  it('refuses an email when the organization has no Resend key', async () => {
    await expect(
      service(null).verify(
        {
          fromEmail: 'achats@example.com',
          fromName: 'ToqueHub Achats',
          replyTo: null,
        },
        'org-1',
      ),
    ).rejects.toThrow('La clé API Resend n’est pas configurée');
  });
});
