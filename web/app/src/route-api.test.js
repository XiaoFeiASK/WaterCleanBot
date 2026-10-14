// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPerceptionRoute } from './api';

const route = {
  coordinateSystem: 'WGS84',
  points: [
    { seq: 1, lng: 121.4296045, lat: 31.2889969, speedKnots: 9 },
    { seq: 2, lng: 121.4296029, lat: 31.2892567, speedKnots: 5 },
  ],
};

function publishedResponse(overrides = {}) {
  return {
    ok: true,
    status: 202,
    json: async () => ({
      status: 'published',
      target: 'USV-001',
      topic: 'mqtt',
      protocol: [40, 2, 121.4296045, 31.2889969, 2, 121.4296029, 31.2892567, 2],
      pointCount: 2,
      coordinateSystemSent: 'WGS84',
      ...overrides,
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('sendPerceptionRoute', () => {
  it('posts all points with the fixed speed of 2', async () => {
    const fetchMock = vi.fn().mockResolvedValue(publishedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendPerceptionRoute('USV-001', route);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/robots/USV-001/perception-route/send'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.points.map((point) => point.speedKnots)).toEqual([2, 2]);
    expect(body.points.map((point) => point.seq)).toEqual([1, 2]);
    expect(result.pointCount).toBe(2);
  });

  it('rejects responses whose protocol speed is not 2', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publishedResponse({
      protocol: [40, 2, 121.4296045, 31.2889969, 5, 121.4296029, 31.2892567, 2],
    })));
    await expect(sendPerceptionRoute('USV-001', route)).rejects.toThrow();
  });

  it('rejects malformed publish responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publishedResponse({ pointCount: 3 })));
    await expect(sendPerceptionRoute('USV-001', route)).rejects.toThrow();
  });

  it('maps backend error statuses to route errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) }));
    await expect(sendPerceptionRoute('USV-001', route)).rejects.toMatchObject({ code: 'INVALID_ROUTE' });
    await expect(sendPerceptionRoute('USV-001', route)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(sendPerceptionRoute('USV-001', route)).rejects.toMatchObject({ code: 'PUBLISH_FAILED' });
  });

  it('rejects routes with fewer than two points before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendPerceptionRoute('USV-001', { points: [route.points[0]] })).rejects.toMatchObject({ code: 'INVALID_ROUTE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
