// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RemoteControlPanel } from './App';
import { sendRobotCommand } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual('./api');
  return {
    ...actual,
    sendRobotCommand: vi.fn(),
    getRemoteCommandErrorMessage: () => '下发失败',
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  sendRobotCommand.mockResolvedValue({ protocol: [36, 5, 1] });
});

function control(label) {
  return screen.getByRole('button', { name: new RegExp(label) });
}

describe('remote actuator interlock', () => {
  it('renames the hatch actuator and blocks disc extension while it is closed', () => {
    const onToast = vi.fn();
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} onToast={onToast} />);

    expect(screen.getByText('翻盖电缸')).toBeTruthy();
    fireEvent.click(control('推出电缸'));

    expect(onToast).toHaveBeenCalledWith('翻盖开关未开启');
    expect(sendRobotCommand).not.toHaveBeenCalled();
  });

  it('allows disc extension after the hatch actuator is opened', async () => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);

    fireEvent.click(control('翻盖电缸'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command: 'HATCH_CYLINDER',
      value: 1,
    })));

    fireEvent.click(control('推出电缸'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', expect.objectContaining({
      command: 'DISC_CYLINDER',
      value: 1,
    })));
  });

  it('allows disc retraction while the hatch actuator is closed', async () => {
    render(<RemoteControlPanel
      position={{
        robotName: 'USV-001',
        actuators: { hatchCylinder: 0, discCylinder: 1 },
      }}
    />);

    fireEvent.click(control('推出电缸'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command: 'DISC_CYLINDER',
      value: 0,
    })));
  });
});


describe('independent throttle stop controls', () => {
  it.each([
    ['左油门', 'THROTTLE_L', '右油门', 'THROTTLE_R', 65, -40],
    ['右油门', 'THROTTLE_R', '左油门', 'THROTTLE_L', -40, 65],
  ])('stops %s immediately and preserves the other throttle', async (label, command, otherLabel, otherCommand, value, otherValue) => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: `${label}数值` }), { target: { value } });
    fireEvent.change(screen.getByRole('spinbutton', { name: `${otherLabel}数值` }), { target: { value: otherValue } });
    expect(sendRobotCommand).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: `${label}停止` }));

    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command,
      value: 0,
      values: expect.objectContaining({ [command]: 0, [otherCommand]: otherValue }),
      ttlMs: 800,
    })));
    expect(sendRobotCommand).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: `${label}数值` }).value).toBe('0');
    expect(screen.getByRole('slider', { name: `${label}百分比` }).value).toBe('0');
    expect(screen.getByRole('spinbutton', { name: `${otherLabel}数值` }).value).toBe(String(otherValue));
    expect(screen.getByRole('slider', { name: `${otherLabel}百分比` }).value).toBe(String(otherValue));

    fireEvent.click(screen.getByRole('button', { name: `${label}停止` }));
    expect(sendRobotCommand).toHaveBeenCalledTimes(2);
  });

  it('disables both stop buttons when no device is selected', () => {
    render(<RemoteControlPanel />);
    for (const label of ['左油门停止', '右油门停止']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(sendRobotCommand).not.toHaveBeenCalled();
  });

  it('reports publish failure and allows the stop command to be retried', async () => {
    const onToast = vi.fn();
    sendRobotCommand.mockRejectedValueOnce(new Error('offline'));
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} onToast={onToast} />);
    const button = screen.getByRole('button', { name: '左油门停止' });
    fireEvent.click(button);
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('下发失败'));
    fireEvent.click(button);
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('已发布 [36,5,1]', 'success'));
    expect(sendRobotCommand).toHaveBeenCalledTimes(2);
  });

  it('still sends the selected throttle value with the regular publish button', async () => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: '左油门数值' }), { target: { value: 55 } });
    fireEvent.click(screen.getAllByRole('button', { name: '下发' })[0]);
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command: 'THROTTLE_L', value: 55,
    })));
  });
});

describe('actuator state labels and control mode', () => {
  it('labels every actuator card with its current state and toggles paddle power without confirmation', async () => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);

    for (const label of ['控制状态', '明轮电源', '船坞释放', '翻盖电缸', '推出电缸', '传送带', '左滚刷', '右滚刷', '垃圾清理']) {
      expect(control(label)).toHaveTextContent(label === '控制状态' ? '当前模式' : '当前状态');
    }

    fireEvent.click(control('明轮电源'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command: 'PADDLE_POWER',
      value: 1,
    })));
    expect(window.confirm).not.toHaveBeenCalled();

    fireEvent.click(control('明轮电源'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', expect.objectContaining({
      command: 'PADDLE_POWER',
      value: 0,
    })));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('shows each actuator with its current state instead of an instruction', () => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);
    for (const label of ['明轮电源', '船坞释放', '翻盖电缸', '推出电缸', '传送带', '左滚刷', '右滚刷', '垃圾清理']) {
      expect(within(control(label)).getByText('当前状态')).toBeTruthy();
      expect(within(control(label)).queryByText('点击执行一次')).toBeNull();
      expect(within(control(label)).queryByText('点击切换')).toBeNull();
    }
  });

  it('shows the reported control state and toggles between protocol values 1 and 2', async () => {
    const { rerender } = render(<RemoteControlPanel position={{ robotName: 'USV-001', controlMode: 1 }} />);
    expect(control('控制状态')).toHaveAttribute('aria-pressed', 'true');
    expect(within(control('控制状态')).getByText('网页端')).toBeTruthy();

    rerender(<RemoteControlPanel position={{ robotName: 'USV-001', controlMode: 2 }} />);
    expect(control('控制状态')).toHaveAttribute('aria-pressed', 'false');
    expect(within(control('控制状态')).getByText('应用端')).toBeTruthy();

    fireEvent.click(control('控制状态'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenCalledWith('USV-001', expect.objectContaining({
      command: 'OPERATING_MODE',
      value: 1,
      values: expect.objectContaining({ OPERATING_MODE: 1 }),
    })));

    fireEvent.click(control('控制状态'));
    await waitFor(() => expect(sendRobotCommand).toHaveBeenLastCalledWith('USV-001', expect.objectContaining({
      command: 'OPERATING_MODE',
      value: 2,
      values: expect.objectContaining({ OPERATING_MODE: 2 }),
    })));
  });

  it('waits for feedback instead of assuming a control state without a report', () => {
    render(<RemoteControlPanel position={{ robotName: 'USV-001' }} />);
    expect(within(control('控制状态')).getByText('等待反馈')).toBeTruthy();
    expect(control('控制状态')).toHaveAttribute('aria-pressed', 'false');
  });
});
