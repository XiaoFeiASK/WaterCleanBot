// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicShoreline } from './ShorelineManager';
import { deleteShoreline, fetchShoreline, replaceShoreline, updateShoreline } from './shoreline-api';

vi.mock('./shoreline-api', () => ({
  fetchShoreline: vi.fn(), replaceShoreline: vi.fn(), updateShoreline: vi.fn(), deleteShoreline: vi.fn(),
}));

const oldDataset = {
  revision: 'revision-1',
  files: { shoreline: { session_id: 'old' }, left: { point_count: 2 }, center: { point_count: 2 }, right: { point_count: 2 } },
};
const newDataset = { revision: 'revision-2', files: { shoreline: { session_id: 'new' } } };

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { cleanup(); });

describe('public shoreline official data', () => {
  it('starts empty, refreshes on focus, replaces the whole bundle and clears it on deletion', async () => {
    fetchShoreline.mockResolvedValueOnce(null).mockResolvedValueOnce(oldDataset);
    const { result } = renderHook(() => usePublicShoreline());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dataset).toBeNull();
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.dataset).toEqual(oldDataset));

    replaceShoreline.mockResolvedValue(newDataset);
    await act(async () => { await result.current.replace(newDataset.files, oldDataset.revision); });
    expect(replaceShoreline).toHaveBeenCalledWith(newDataset.files, oldDataset.revision);
    expect(result.current.dataset.files).toEqual(newDataset.files);
    expect(result.current.dataset.files.left).toBeUndefined();
    expect(result.current.dataset.files.center).toBeUndefined();
    expect(result.current.dataset.files.right).toBeUndefined();

    deleteShoreline.mockResolvedValue(null);
    await act(async () => { await result.current.remove(newDataset.revision); });
    expect(result.current.dataset).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps official data on failed replacement, failed deletion and failed refresh', async () => {
    fetchShoreline.mockResolvedValue(oldDataset);
    const { result } = renderHook(() => usePublicShoreline());
    await waitFor(() => expect(result.current.dataset).toEqual(oldDataset));
    const conflict = Object.assign(new Error('版本冲突'), { status: 409 });
    replaceShoreline.mockRejectedValue(conflict);
    await act(async () => { await expect(result.current.replace(newDataset.files, oldDataset.revision)).rejects.toBe(conflict); });
    expect(result.current.dataset).toEqual(oldDataset);
    deleteShoreline.mockRejectedValue(new Error('删除失败'));
    await act(async () => { await expect(result.current.remove(oldDataset.revision)).rejects.toThrow('删除失败'); });
    expect(result.current.dataset).toEqual(oldDataset);
    fetchShoreline.mockRejectedValue(new Error('读取失败'));
    await act(async () => { await expect(result.current.reload()).rejects.toThrow('读取失败'); });
    expect(result.current.dataset).toEqual(oldDataset);
    expect(result.current.error).toBe('读取失败');
    expect(result.current.busy).toBe(false);
  });

  it('merges an independently uploaded file through PATCH', async () => {
    fetchShoreline.mockResolvedValue(oldDataset);
    const { result } = renderHook(() => usePublicShoreline());
    await waitFor(() => expect(result.current.dataset).toEqual(oldDataset));
    updateShoreline.mockResolvedValue(newDataset);

    await act(async () => { await result.current.update({ center: { point_count: 3 } }, oldDataset.revision); });

    expect(updateShoreline).toHaveBeenCalledWith({ center: { point_count: 3 } }, oldDataset.revision);
    expect(result.current.dataset).toEqual(newDataset);
  });

  it('ignores a stale GET resolving after a successful replacement', async () => {
    fetchShoreline.mockResolvedValueOnce(oldDataset);
    const { result } = renderHook(() => usePublicShoreline());
    await waitFor(() => expect(result.current.dataset).toEqual(oldDataset));
    let resolveRead;
    fetchShoreline.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    let pendingRead;
    act(() => { pendingRead = result.current.reload(); });
    const signal = fetchShoreline.mock.calls.at(-1)[0];
    replaceShoreline.mockResolvedValue(newDataset);
    await act(async () => { await result.current.replace(newDataset.files, oldDataset.revision); });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveRead(oldDataset); await pendingRead; });
    expect(result.current.dataset).toEqual(newDataset);
  });
});
