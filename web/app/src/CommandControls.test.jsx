// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DockEjectButton, requestRemoteSwitchConfirmation, TrackingButton } from './CommandControls';
import { sendRobotCommand } from './api';

vi.mock('./api', () => ({
  sendRobotCommand: vi.fn(),
  getRemoteCommandErrorMessage: () => '下发失败',
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

describe('tracking button', () => {
  it('shows separate start and stop actions and confirms each command', async () => {
    sendRobotCommand.mockResolvedValue({ protocol: [24, 1] });
    render(<TrackingButton deviceId="USV-001" />);
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
    sendRobotCommand.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ protocol: [24, 1] });
    render(<TrackingButton deviceId="USV-001" onToast={onToast} />);
    fireEvent.click(trackingStart());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('下发失败'));
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(trackingStart());
    await waitFor(() => expect(trackingStart().getAttribute('aria-pressed')).toBe('true'));
  });

  it('ignores duplicate clicks and isolates an in-flight result from a different device', async () => {
    let resolve;
    sendRobotCommand.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<TrackingButton deviceId="USV-001" />);
    fireEvent.click(trackingStart());
    fireEvent.click(trackingStop());
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    rerender(<TrackingButton deviceId="USV-002" />);
    resolve({ protocol: [24, 1] });
    await waitFor(() => expect(trackingStart().disabled).toBe(false));
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    rerender(<TrackingButton deviceId="USV-001" />);
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
    render(<TrackingButton deviceId="USV-001" />);
    fireEvent.click(trackingStart());
    expect(sendRobotCommand).not.toHaveBeenCalled();
    expect(trackingStart().getAttribute('aria-pressed')).toBe('false');
    expect(trackingStart().disabled).toBe(false);
  });
});

describe('dock eject action', () => {
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
