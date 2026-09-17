// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DockEjectButton, requestRemoteSwitchConfirmation, TrackingSwitch } from './CommandControls';
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

const tracking = () => screen.getByRole('switch', { name: '循迹开关' });

describe('tracking switch', () => {
  it('starts and stops without a route or unlock condition', async () => {
    sendRobotCommand.mockResolvedValue({ protocol: [24, 1] });
    render(<TrackingSwitch deviceId="USV-001" />);
    expect(tracking().disabled).toBe(false);
    fireEvent.click(tracking());
    await waitFor(() => expect(tracking().getAttribute('aria-checked')).toBe('true'));
    expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', {
      command: 'TRACKING', value: 1, values: { TRACKING: 1 }, ttlMs: 800,
    });
    fireEvent.click(tracking());
    await waitFor(() => expect(tracking().getAttribute('aria-checked')).toBe('false'));
    expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', {
      command: 'TRACKING', value: 0, values: { TRACKING: 0 }, ttlMs: 800,
    });
  });

  it('does not change state on failure and allows retry', async () => {
    const onToast = vi.fn();
    sendRobotCommand.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ protocol: [24, 1] });
    render(<TrackingSwitch deviceId="USV-001" onToast={onToast} />);
    fireEvent.click(tracking());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('下发失败'));
    expect(tracking().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(tracking());
    await waitFor(() => expect(tracking().getAttribute('aria-checked')).toBe('true'));
  });

  it('ignores duplicate clicks and isolates an in-flight result from a different device', async () => {
    let resolve;
    sendRobotCommand.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<TrackingSwitch deviceId="USV-001" />);
    fireEvent.click(tracking());
    fireEvent.click(tracking());
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    rerender(<TrackingSwitch deviceId="USV-002" />);
    resolve({ protocol: [24, 1] });
    await waitFor(() => expect(tracking().getAttribute('aria-busy')).toBe('false'));
    expect(tracking().getAttribute('aria-checked')).toBe('false');
    rerender(<TrackingSwitch deviceId="USV-001" />);
    await waitFor(() => expect(tracking().getAttribute('aria-checked')).toBe('true'));
  });

  it('stays visible without a target and explains how to send', () => {
    const onToast = vi.fn();
    render(<TrackingSwitch onToast={onToast} />);
    fireEvent.click(tracking());
    expect(sendRobotCommand).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('请先查询需要控制的设备');
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
  it('requires confirmation before powering the paddle wheel', () => {
    window.confirm.mockReturnValue(false);
    const accepted = requestRemoteSwitchConfirmation(
      { cmd: 'PADDLE_POWER', onText: '上电', offText: '断电' },
      1,
    );
    expect(accepted).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith('确认将明轮电源“上电”吗？');
  });
});
