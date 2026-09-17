// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App, { FleetManagement } from './App';
import { createRobot, deleteRobot, fetchRobotLocation, subscribeRobotLocations } from './api';

vi.mock('./api', async (original) => ({ ...(await original()), createRobot: vi.fn(), deleteRobot: vi.fn(), fetchRobotLocation: vi.fn(), subscribeRobotLocations: vi.fn(() => () => {}) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { displayName: '测试', username: 'tester' }, signOut: vi.fn() }) }));

const pending = { robotName: 'USV-002', lat: null, lng: null, heading: null, speed: null, battery: null, status: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('fleet management', () => {
  it('shows a real empty state and waits for server events to display a created device', async () => {
    createRobot.mockResolvedValue();
    const onToast = vi.fn();
    const { rerender } = render(<FleetManagement fleetPositions={[]} onToast={onToast} />);
    expect(screen.getByText('暂无设备')).toBeTruthy();
    expect(screen.queryByText('USV-001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加船' }));
    fireEvent.change(screen.getByLabelText('船舶编号'), { target: { value: ' USV-002 ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加', exact: true }));
    await waitFor(() => expect(createRobot).toHaveBeenCalledWith('USV-002'));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('设备已添加并保存', 'success'));
    rerender(<FleetManagement fleetPositions={[pending]} onToast={onToast} />);
    expect(screen.getByText('待接入')).toBeTruthy();
    expect(screen.getAllByText('--')).toHaveLength(3);
  });
  it('prevents duplicates and shows database failures', async () => {
    const { rerender } = render(<FleetManagement fleetPositions={[pending]} />);
    fireEvent.click(screen.getByRole('button', { name: '添加船' }));
    fireEvent.change(screen.getByLabelText('船舶编号'), { target: { value: 'USV-002' } });
    fireEvent.click(screen.getByRole('button', { name: '添加', exact: true }));
    expect(screen.getByRole('alert').textContent).toBe('该设备编号已存在');
    expect(createRobot).not.toHaveBeenCalled();
    rerender(<FleetManagement fleetPositions={[]} />);
    createRobot.mockRejectedValue(Object.assign(new Error('缓存已更新，数据库保存失败，后台正在重试'), { cacheChanged: true }));
    fireEvent.click(screen.getByRole('button', { name: '添加', exact: true }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('数据库保存失败'));
  });
  it('confirms deletion, calls the backend and permits the same device to reappear', async () => {
    deleteRobot.mockResolvedValue();
    const { rerender } = render(<FleetManagement fleetPositions={[pending]} />);
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '删除 USV-002' }));
    expect(deleteRobot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '删除 USV-002' }));
    await waitFor(() => expect(deleteRobot).toHaveBeenCalledWith('USV-002'));
    rerender(<FleetManagement fleetPositions={[]} />);
    expect(screen.queryByText('USV-002')).toBeNull();
    rerender(<FleetManagement fleetPositions={[pending]} />);
    expect(screen.getByText('USV-002')).toBeTruthy();
  });
  it('removes selected details and feedback cache when another client deletes the boat', async () => {
    let handlers;
    subscribeRobotLocations.mockImplementation((callbacks) => { handlers = callbacks; return () => {}; });
    fetchRobotLocation.mockResolvedValue(pending);
    localStorage.setItem('watercleanbot.activePage', 'fleet');
    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => handlers.onSnapshot([pending]));
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '详情' }));
    await waitFor(() => expect(screen.getByLabelText('设备名称').value).toBe('USV-002'));
    localStorage.setItem('watercleanbot.deviceFeedback.USV-002', '{}');
    await act(async () => handlers.onDeleted('USV-002'));
    expect(screen.getByLabelText('设备名称').value).toBe('');
    expect(localStorage.getItem('watercleanbot.deviceFeedback.USV-002')).toBeNull();
  });
});
