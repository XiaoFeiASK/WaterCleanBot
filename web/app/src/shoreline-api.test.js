import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteShoreline, fetchShoreline, replaceShoreline } from './shoreline-api';

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public shoreline API', () => {
  it('loads without browser caching and includes the authenticated session', async () => {
    const dataset = { revision: 'r1', files: {} };
    const fetchMock = vi.fn().mockResolvedValue(response({ dataset }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchShoreline()).resolves.toEqual(dataset);
    expect(fetchMock).toHaveBeenCalledWith('/api/shoreline', expect.objectContaining({
      method: 'GET', credentials: 'include', cache: 'no-store',
    }));
  });

  it('sends the complete replacement and expected revision as JSON', async () => {
    const dataset = { revision: 'r2', files: {} };
    const fetchMock = vi.fn().mockResolvedValue(response({ dataset }));
    vi.stubGlobal('fetch', fetchMock);
    const files = { shoreline: { session_id: 'bundle-a' }, left: null };

    await expect(replaceShoreline(files, 'r1')).resolves.toEqual(dataset);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/shoreline');
    expect(request).toMatchObject({ method: 'PUT', credentials: 'include', cache: 'no-store' });
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({ files, expectedRevision: 'r1' });
  });

  it('deletes using an optimistic revision and returns an empty dataset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ dataset: null }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteShoreline('r2')).resolves.toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expectedRevision: 'r2' });
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('preserves conflict status and backend message for the manager', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      error: { code: 'revision_conflict', message: '公共岸线已更新，请重新加载' },
    }, 409)));

    await expect(deleteShoreline('stale')).rejects.toMatchObject({
      message: '公共岸线已更新，请重新加载', code: 'revision_conflict', status: 409,
    });
  });

  it('rejects serialized payloads larger than the server request limit before sending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const files = { shoreline: { padding: '河'.repeat(7_000_000) } };

    await expect(replaceShoreline(files, null)).rejects.toThrow('上传数据不能超过 20 MiB');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
