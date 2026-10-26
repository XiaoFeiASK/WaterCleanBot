// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShorelineManager from './ShorelineManager';
import { readShorelineFiles } from './shorelines';

vi.mock('./shorelines', async () => {
  const actual = await vi.importActual('./shorelines');
  return { ...actual, readShorelineFiles: vi.fn() };
});

function shorelineFile(sessionId, longitude) {
  return {
    schema_version: 3,
    session_id: sessionId,
    state: 'completed',
    datum: 'WGS84',
    valid: true,
    contour_count: 1,
    point_count: 2,
    contours: [{
      contour_id: 1,
      side: 1,
      sections: [{
        line_id: 1,
        contour_id: 1,
        section_order: 1,
        side: 1,
        kind: 1,
        points: [
          { longitude_deg: longitude, latitude_deg: 31.2 },
          { longitude_deg: longitude + 0.01, latitude_deg: 31.3 },
        ],
      }],
    }],
  };
}

const stagedFiles = { shoreline: shorelineFile('new-bundle', 121.6) };
const currentDataset = {
  revision: 'revision-1',
  files: { shoreline: shorelineFile('old-bundle', 121.4) },
  updatedAt: '2026-10-16T08:00:00Z',
  uploadedBy: { id: 'user-1', displayName: '测试用户' },
};

function makeStore(overrides = {}) {
  return {
    dataset: currentDataset,
    loading: false,
    busy: false,
    error: '',
    reload: vi.fn().mockResolvedValue(currentDataset),
    update: vi.fn().mockResolvedValue(currentDataset),
    remove: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function selectShorelineFile() {
  const file = new File(['{}'], 'shoreline_lonlat.json', { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('上传岸线 JSON 文件'), { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  readShorelineFiles.mockResolvedValue(stagedFiles);
});

describe('public shoreline manager', () => {
  it('shows the current dataset metadata and allows selecting one file independently', async () => {
    const store = makeStore();
    render(<ShorelineManager store={store} onPreview={vi.fn()} onCancelPreview={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/来源 old-bundle/)).toBeTruthy();
    expect(screen.getByText('上传人 测试用户')).toBeTruthy();
    selectShorelineFile();
    const missingOptionalFiles = await screen.findAllByText('未导入');
    expect(missingOptionalFiles).toHaveLength(3);
    expect(screen.getByText('shoreline_lonlat.json')).toBeTruthy();
  });

  it('previews a staged dataset and cancels it without replacing the current dataset', async () => {
    const onPreview = vi.fn();
    const onCancelPreview = vi.fn();
    const store = makeStore();
    render(<ShorelineManager store={store} onPreview={onPreview} onCancelPreview={onCancelPreview} onSaved={vi.fn()} onClose={vi.fn()} />);
    selectShorelineFile();
    fireEvent.click(await screen.findByRole('button', { name: '地图预览' }));
    expect(onPreview).toHaveBeenCalledWith({
      ...currentDataset.files,
      ...stagedFiles,
    });
    fireEvent.click(screen.getByRole('button', { name: '取消导入' }));
    expect(onCancelPreview).toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '确认替换' })).toBeNull();
  });

  it('updates only the selected file using the captured revision', async () => {
    const store = makeStore();
    const onSaved = vi.fn();
    const onCancelPreview = vi.fn();
    render(<ShorelineManager store={store} onPreview={vi.fn()} onCancelPreview={onCancelPreview} onSaved={onSaved} onClose={vi.fn()} />);
    selectShorelineFile();
    fireEvent.click(await screen.findByRole('button', { name: '确认替换' }));
    await waitFor(() => expect(store.update).toHaveBeenCalledWith(stagedFiles, 'revision-1'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('其他已上传的岸线和航线将保留'));
    expect(onSaved).toHaveBeenCalled();
    expect(onCancelPreview).toHaveBeenCalled();
  });

  it('retains the staged import after a save error and requires reload after a version conflict', async () => {
    const conflict = Object.assign(new Error('版本冲突，请重新加载'), { status: 409 });
    const store = makeStore({ update: vi.fn().mockRejectedValue(conflict) });
    render(<ShorelineManager store={store} onPreview={vi.fn()} onCancelPreview={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />);
    selectShorelineFile();
    fireEvent.click(await screen.findByRole('button', { name: '确认替换' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('版本冲突');
    expect(screen.getByRole('button', { name: '确认替换' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消导入' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新加载当前数据' }));
    await waitFor(() => expect(store.reload).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '确认替换' })).toBeEnabled();
  });

  it('deletes the public dataset with its current revision after explicit confirmation', async () => {
    const store = makeStore();
    render(<ShorelineManager store={store} onPreview={vi.fn()} onCancelPreview={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '删除公共岸线' }));
    await waitFor(() => expect(store.remove).toHaveBeenCalledWith('revision-1'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('影响所有用户'));
  });

  it('keeps the current dataset and reports a delete error without pretending it was removed', async () => {
    const store = makeStore({ remove: vi.fn().mockRejectedValue(new Error('数据库暂不可用')) });
    const onDeleted = vi.fn();
    render(<ShorelineManager store={store} onPreview={vi.fn()} onCancelPreview={vi.fn()} onSaved={vi.fn()} onDeleted={onDeleted} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '删除公共岸线' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('数据库暂不可用');
    expect(screen.getByText(/来源 old-bundle/)).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
