// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
