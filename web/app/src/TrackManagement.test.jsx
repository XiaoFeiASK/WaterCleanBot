// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import {
  createRobotTrack,
  deleteRobotTrack,
  endRobotTrack,
  fetchRobotLocation,
  fetchRobotTrackPoints,
  fetchRobotTracks,
  subscribeRobotLocations,
} from './api';

vi.mock('./api', async (original) => ({
  ...(await original()),
  createRobotTrack: vi.fn(),
  deleteRobotTrack: vi.fn(),
  endRobotTrack: vi.fn(),
  fetchRobotLocation: vi.fn(),
  fetchRobotTrackPoints: vi.fn(),
  fetchRobotTracks: vi.fn(),
  subscribeRobotLocations: vi.fn(() => () => {}),
}));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { displayName: '测试', username: 'tester' }, signOut: vi.fn() }) }));

let streamHandlers;
const position = {
  robotName: 'USV-001', lat: 31.2, lng: 121.4, heading: 90, speed: 1.2, battery: 88, status: 1,
  sourceTimestampMs: 1000, receivedAtMs: 1000,
};
const endedTrack = { id: 1, trackNo: 1, name: '轨迹 1', status: 'ended', startedAt: '2026-10-12T00:00:00.000Z', endedAt: '2026-10-12T00:10:00.000Z', pointCount: 2 };
const recordingTrack = { id: 2, trackNo: 2, name: '轨迹 2', status: 'recording', startedAt: '2026-10-12T01:00:00.000Z', endedAt: null, pointCount: 1 };

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  subscribeRobotLocations.mockImplementation((callbacks) => { streamHandlers = callbacks; return () => {}; });
  fetchRobotLocation.mockResolvedValue(position);
  fetchRobotTracks.mockResolvedValue([endedTrack]);
  fetchRobotTrackPoints.mockResolvedValue([{ seq: 1, lat: 31.2, lng: 121.4, receivedAt: '2026-10-12T00:00:00.000Z' }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function renderDetails(expand = true) {
  render(<MemoryRouter><App /></MemoryRouter>);
  await act(async () => streamHandlers.onSnapshot([position]));
  await screen.findByText('历史轨迹');
  const list = within(screen.getByLabelText('历史轨迹'));
  if (expand) fireEvent.click(list.getByRole('button', { name: /展开/ }));
  return list;
}

describe('track management', () => {
  it('starts collapsed and keeps selected tracks when collapsed again', async () => {
    const list = await renderDetails(false);
    await waitFor(() => expect(list.getByText('1 条')).toBeTruthy());
    const toggle = list.getByRole('button', { name: /展开/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.queryByRole('button', { name: /轨迹 1/ })).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(list.getByRole('button', { name: /轨迹 1/ }));
    await waitFor(() => expect(fetchRobotTrackPoints).toHaveBeenCalledTimes(1));
    fireEvent.click(toggle);
    expect(list.getByText(/已显示 1 条/)).toBeTruthy();
    expect(list.queryByRole('button', { name: /轨迹 1/ })).toBeNull();
    fireEvent.click(toggle);
    expect(list.getByRole('button', { name: /轨迹 1/ }).getAttribute('aria-pressed')).toBe('true');
    expect(fetchRobotTrackPoints).toHaveBeenCalledTimes(1);
  });

  it('keeps the recording status visible while collapsed', async () => {
    fetchRobotTracks.mockResolvedValue([endedTrack, recordingTrack]);
    const list = await renderDetails(false);
    await waitFor(() => expect(list.getByText('正在记录 轨迹 2')).toBeTruthy());
    expect(list.getByText('2 条')).toBeTruthy();
    expect(list.queryByRole('button', { name: '全选' })).toBeNull();
    expect(screen.getByRole('button', { name: '结束记录' })).toBeTruthy();
    expect(endRobotTrack).not.toHaveBeenCalled();
  });

  it('starts recording and shows an active recording state', async () => {
    createRobotTrack.mockResolvedValue(recordingTrack);
    const list = await renderDetails();
    fireEvent.click(screen.getByRole('button', { name: '开始记录' }));
    await waitFor(() => expect(createRobotTrack).toHaveBeenCalledWith('USV-001'));
    expect(list.getByText('轨迹 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '结束记录' })).toBeTruthy();
  });

  it('shows the duplicate-start message returned by the API', async () => {
    const { getTrackErrorMessage } = await import('./api');
    expect(getTrackErrorMessage({ code: 'ACTIVE_TRACK_EXISTS' })).toBe('请先结束当前轨迹');
  });

  it('loads an ended track in red only when it is selected', async () => {
    const list = await renderDetails();
    fireEvent.click(list.getByRole('button', { name: /轨迹 1/ }));
    await waitFor(() => expect(fetchRobotTrackPoints).toHaveBeenCalledWith('USV-001', 1, expect.any(AbortSignal)));
    expect(screen.getByText('轨迹 1')).toBeTruthy();
  });

  it('deletes an ended track only after confirmation', async () => {
    deleteRobotTrack.mockResolvedValue();
    const list = await renderDetails();
    const deleteButton = list.getByRole('button', { name: '删除' });
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(deleteButton);
    expect(deleteRobotTrack).not.toHaveBeenCalled();
    fireEvent.click(deleteButton);
    await waitFor(() => expect(deleteRobotTrack).toHaveBeenCalledWith('USV-001', 1));
    await waitFor(() => expect(within(screen.getByLabelText('历史轨迹')).queryByText('轨迹 1')).toBeNull());
  });
});

describe('track end recovery', () => {
  it('keeps the track ended even when loading its points fails', async () => {
    const endedResult = { ...recordingTrack, status: 'ended', endedAt: '2026-10-12T01:05:00.000Z', pointCount: 3 };
    fetchRobotTracks.mockResolvedValue([recordingTrack]);
    endRobotTrack.mockResolvedValue(endedResult);
    fetchRobotTrackPoints.mockRejectedValue(new Error('points unavailable'));

    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => streamHandlers.onSnapshot([position]));
    await screen.findByText('历史轨迹');

    const endButton = await screen.findByRole('button', { name: '结束记录' });
    fireEvent.click(endButton);

    await waitFor(() => expect(endRobotTrack).toHaveBeenCalledWith('USV-001', recordingTrack.id));
    await waitFor(() => expect(screen.getByRole('button', { name: '开始记录' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: '结束记录' })).toBeNull();
    const list = within(screen.getByLabelText('历史轨迹'));
    fireEvent.click(list.getByRole('button', { name: /展开/ }));
    await waitFor(() => expect(list.getByRole('button', { name: /轨迹 2/ })).toBeTruthy());
    expect(list.getByRole('button', { name: '删除' })).toBeTruthy();
  });
});
