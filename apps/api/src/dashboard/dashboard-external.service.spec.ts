import { DashboardExternalService } from './dashboard-external.service';

describe('DashboardExternalService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks for a site address instead of calling an external provider when no location exists', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const result = await new DashboardExternalService().get();
    expect(result.weather).toMatchObject({ status: 'needs_location' });
    expect(result.localNews).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the dashboard usable when the weather provider is unavailable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const result = await new DashboardExternalService().get('12 rue de la Paix, Paris');
    expect(result.weather).toMatchObject({ status: 'unavailable' });
    expect(result.localNews).toEqual([]);
    expect(result.industryNews).toEqual([]);
  });
});
