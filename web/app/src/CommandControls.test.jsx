// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DockEjectButton, formatTrackingDuration, requestRemoteSwitchConfirmation, TrackingButton } from './CommandControls';
import { sendRobotCommand } from './api';

vi.mock('./api', () => ({
  sendRobotCommand: vi.fn(),
  getRemoteCommandErrorMessage: (error) => error?.code === 'BATTERY_UNAVAILABLE'
    ? '设备当前电量数据不可用，暂时无法记录耗电'
    : '下发失败',
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const trackingStart = () => screen.getByRole('button', { name: '开始循迹' });
const trackingStop = () => screen.getByRole('button', { name: '结束循迹' });
const testRoute = { key: 'planned:route-1', name: '2026-11-04-12-00' };
const renderTracking = (props = {}) => render(
  <TrackingButton deviceId="USV-001" route={testRoute} {...props} />,
);

describe('tracking button', () => {
  it('formats the server-recorded tracking duration in hours, minutes, and seconds', () => {
    expect(formatTrackingDuration('2026-11-04T04:00:00.000Z', '2026-11-04T05:02:03.400Z')).toBe('1时2分3秒');
    expect(formatTrackingDuration('invalid', '2026-11-04T05:02:03.400Z')).toBe('');
  });

  it('shows separate start and stop actions and confirms each command', async () => {
    sendRobotCommand.mockResolvedValue({ protocol: [24, 1] });
    const { rerender } = renderTracking();
    expect(screen.queryByRole('combobox', { name: '循迹航线' })).toBeNull();
    expect(trackingStart().disabled).toBe(false);
    expect(trackingStop().disabled).toBe(false);
    fireEvent.click(trackingStart());
    expect(window.confirm).toHaveBeenCalledWith('确认开始循迹吗？');
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
    expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', {
      command: 'TRACKING', value: 1, values: { TRACKING: 1 }, ttlMs: 800,
    });
    window.confirm.mockReturnValue(false);
    fireEvent.click(trackingStop());
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    window.confirm.mockReturnValue(true);
    fireEvent.click(trackingStop());
    expect(window.confirm).toHaveBeenCalledWith('确认结束循迹吗？');
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('false'));
    expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', {
      command: 'TRACKING', value: 0, values: { TRACKING: 0 }, ttlMs: 800,
    });
  });

  it('does not change state on failure and allows retry', async () => {
    const onToast = vi.fn();
    const onTrackingStatsChange = vi.fn().mockResolvedValue({ routeKey: testRoute.key, trackingActive: true });
    sendRobotCommand.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ protocol: [24, 1] });
    renderTracking({ onToast, onTrackingStatsChange });
    fireEvent.click(trackingStart());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('下发失败'));
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    expect(onTrackingStatsChange.mock.calls.map(([action]) => action)).toEqual(['start', 'cancel']);
    fireEvent.click(trackingStart());
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
  });

  it('ignores duplicate clicks and isolates an in-flight result from a different device', async () => {
    let resolve;
    sendRobotCommand.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = renderTracking();
    fireEvent.click(trackingStart());
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalled());
    fireEvent.click(trackingStop());
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    rerender(<TrackingButton deviceId="USV-002" route={testRoute} />);
    resolve({ protocol: [24, 1] });
    await waitFor(() => expect(trackingStart().disabled).toBe(false));
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    rerender(<TrackingButton deviceId="USV-001" route={testRoute} />);
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
  });

  it('keeps both actions visible but disabled without a target', () => {
    render(<TrackingButton />);
    expect(trackingStart().disabled).toBe(true);
    expect(trackingStop().disabled).toBe(true);
    expect(sendRobotCommand).not.toHaveBeenCalled();
  });

  it('does not publish or change the action when confirmation is cancelled', () => {
    window.confirm.mockReturnValue(false);
    renderTracking();
    fireEvent.click(trackingStart());
    expect(sendRobotCommand).not.toHaveBeenCalled();
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    expect(trackingStart().disabled).toBe(false);
  });

  it('has no route selector and records the dispatched route on start', async () => {
    const onTrackingStatsChange = vi.fn().mockResolvedValue({ routeKey: testRoute.key, trackingActive: true });
    sendRobotCommand.mockResolvedValue({ protocol: [24, 1] });
    renderTracking({ onTrackingStatsChange });
    expect(screen.queryByRole('combobox', { name: '循迹航线' })).toBeNull();
    expect(screen.queryByText('点击循环一次')).toBeNull();
    expect(screen.getByText('循迹控制').parentElement.querySelector('small')).toBeNull();
    fireEvent.click(trackingStart());
    await waitFor(() => expect(onTrackingStatsChange).toHaveBeenCalledWith('start', testRoute));
  });

  it('blocks start without a dispatched route while keeping end available', () => {
    const onToast = vi.fn();
    render(<TrackingButton deviceId="USV-001" onToast={onToast} />);
    expect(trackingStart().disabled).toBe(false);
    expect(trackingStop().disabled).toBe(false);
    fireEvent.click(trackingStart());
    expect(onToast).toHaveBeenCalledWith('请先下发一条航线，再开始循迹');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('rolls back the battery baseline when the tracking publish fails', async () => {
    const onTrackingStatsChange = vi.fn().mockResolvedValue({ routeKey: testRoute.key, trackingActive: false });
    sendRobotCommand.mockRejectedValue(new Error('offline'));
    renderTracking({ onTrackingStatsChange });
    fireEvent.click(trackingStart());
    await waitFor(() => expect(onTrackingStatsChange).toHaveBeenLastCalledWith('cancel', testRoute));
    expect(onTrackingStatsChange.mock.calls.map(([action]) => action)).toEqual(['start', 'cancel']);
    expect(sendRobotCommand).toHaveBeenCalledOnce();
  });

  it('shows a prominent completion result from the server battery difference after ending', async () => {
    const onTrackingStatsChange = vi.fn()
      .mockResolvedValueOnce({
        routeKey: testRoute.key,
        routeName: testRoute.name,
        trackingActive: true,
        batteryConsumedPercent: null,
        startedAt: '2026-11-04T04:00:00.000Z',
        updatedAt: '2026-11-04T04:00:00.000Z',
      })
      .mockResolvedValueOnce({
        routeKey: testRoute.key,
        routeName: testRoute.name,
        trackingActive: false,
        batteryConsumedPercent: 4.2,
        startedAt: '2026-11-04T04:00:00.000Z',
        endedAt: '2026-11-04T05:02:03.000Z',
        updatedAt: '2026-11-04T05:02:03.000Z',
      });
    sendRobotCommand.mockResolvedValue({ protocol: [24, 1] });
    const onToast = vi.fn();
    renderTracking({ onTrackingStatsChange, onToast });
    fireEvent.click(trackingStart());
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
    expect(screen.queryByRole('dialog', { name: '本次循迹结果' })).toBeNull();

    fireEvent.click(trackingStop());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith(
      `结束循迹指令已发布 ${JSON.stringify([24, 1])}`,
      'success',
    ));
    const dialog = await screen.findByRole('dialog', { name: '本次循迹结果' });
    expect(dialog.textContent.replace(/\s+/g, '')).toContain('本次循迹耗时1时2分3秒，损耗电量🔋为4.2%！');
    expect(dialog.textContent).toContain(`绑定航线 · ${testRoute.name}`);
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('dialog', { name: '本次循迹结果' })).toBeNull();
  });

  it('does not show a completion result when the stop command cannot be published', async () => {
    const onTrackingStatsChange = vi.fn().mockImplementation(async (_robot, action) => ({
      routeKey: testRoute.key,
      routeName: testRoute.name,
      trackingActive: action === 'start',
      batteryConsumedPercent: action === 'end' ? 4.2 : null,
      startedAt: '2026-11-04T04:00:00.000Z',
      endedAt: action === 'end' ? '2026-11-04T05:02:03.000Z' : null,
      updatedAt: '2026-11-04T05:02:03.000Z',
    }));
    sendRobotCommand.mockResolvedValueOnce({ protocol: [24, 1] }).mockRejectedValueOnce(new Error('offline'));
    const onToast = vi.fn();
    renderTracking({ onTrackingStatsChange, onToast });
    fireEvent.click(trackingStart());
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(trackingStop());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('下发失败'));
    expect(screen.queryByRole('dialog', { name: '本次循迹结果' })).toBeNull();
  });

  it('does not publish when battery telemetry is unavailable', async () => {
    const onToast = vi.fn();
    const onTrackingStatsChange = vi.fn().mockRejectedValue(Object.assign(new Error('missing battery'), {
      code: 'BATTERY_UNAVAILABLE',
    }));
    renderTracking({ onToast, onTrackingStatsChange });
    fireEvent.click(trackingStart());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('设备当前电量数据不可用，暂时无法记录耗电'));
    expect(sendRobotCommand).not.toHaveBeenCalled();
    expect(onTrackingStatsChange.mock.calls.map(([action]) => action)).toEqual(['start']);
  });
});

describe('dock eject action', () => {
  it('shows one-shot guidance without a current-state label', () => {
    render(<DockEjectButton deviceId="USV-001" />);
    const button = screen.getByRole('button', { name: /船坞释放/ });
    expect(within(button).getByText('点击循环一次')).toBeTruthy();
    expect(within(button).queryByText('当前状态')).toBeNull();
  });

  it('sends a parameterless action each time, not a persistent toggle', async () => {
    const onToast = vi.fn();
    sendRobotCommand.mockResolvedValue({ protocol: [234, 1, 235], protocolHex: '[EA 01 EB]' });
    render(<DockEjectButton deviceId="USV-001" onToast={onToast} />);
    const button = screen.getByRole('button', { name: /船坞释放/ });
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', { command: 'DOCK_EJECT' });
    expect(onToast).toHaveBeenCalledWith('船坞释放指令已发布 [EA 01 EB]', 'success');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledTimes(2));
  });

  it('prevents duplicate sends and recovers after failure', async () => {
    let reject;
    const onToast = vi.fn();
    sendRobotCommand.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    render(<DockEjectButton deviceId="USV-001" onToast={onToast} />);
    const button = screen.getByRole('button', { name: /船坞释放/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    reject(new Error('offline'));
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(onToast).toHaveBeenCalledWith('下发失败');
  });

  it('does not send when release confirmation is cancelled', () => {
    window.confirm.mockReturnValue(false);
    render(<DockEjectButton deviceId="USV-001" />);
    fireEvent.click(screen.getByRole('button', { name: /船坞释放/ }));
    expect(window.confirm).toHaveBeenCalledWith('确认执行船坞释放吗？');
    expect(sendRobotCommand).not.toHaveBeenCalled();
  });
});

describe('critical switch confirmation', () => {
  it('does not interrupt paddle power changes with a confirmation dialog', () => {
    window.confirm.mockReturnValue(false);
    const powerOff = requestRemoteSwitchConfirmation(
      { cmd: 'PADDLE_POWER', onText: '上电', offText: '断电' },
      0,
    );
    const powerOn = requestRemoteSwitchConfirmation(
      { cmd: 'PADDLE_POWER', onText: '上电', offText: '断电' },
      1,
    );
    expect(powerOff).toBe(true);
    expect(powerOn).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('confirms the control state using its web and app labels', () => {
    window.confirm.mockReturnValue(false);
    const accepted = requestRemoteSwitchConfirmation(
      { cmd: 'OPERATING_MODE', onText: '网页端', offText: '应用端' },
      2,
    );
    expect(accepted).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith('确认切换控制状态为“应用端”吗？');
  });
});
