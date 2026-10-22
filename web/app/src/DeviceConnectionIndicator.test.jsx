// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import DeviceConnectionIndicator from './DeviceConnectionIndicator';

const status = () => screen.getByRole('status', { name: '设备 MQTT 连接状态' });
const position = (overrides = {}) => ({
  robotName: 'USV-001', lat: 31.2, lng: 121.4,
  positionUpdatedAtMs: Date.now(), receivedAtMs: Date.now(), ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MQTT coordinate connection indicator', () => {
  it('lights up for a fresh coordinate pair and turns off only after 3 seconds', () => {
    render(<DeviceConnectionIndicator position={position()} />);
    expect(status()).toHaveClass('device-connection--online');
    expect(status()).toHaveTextContent('开机');
    expect(status()).toHaveTextContent('MQTT 已连接');
    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toHaveClass('device-connection--online');
    act(() => vi.advanceTimersByTime(1));
    expect(status()).toHaveClass('device-connection--offline');
    expect(status()).toHaveTextContent('关机');
    expect(status()).toHaveTextContent('超过 3 秒未收到经纬度');
  });

  it('restarts the deadline for each report even when the vessel has not moved', () => {
    const { rerender } = render(<DeviceConnectionIndicator position={position()} />);
    act(() => vi.advanceTimersByTime(2000));
    rerender(<DeviceConnectionIndicator position={position()} />);
    act(() => vi.advanceTimersByTime(1001));
    expect(status()).toHaveClass('device-connection--online');
    act(() => vi.advanceTimersByTime(2000));
    expect(status()).toHaveClass('device-connection--offline');
    rerender(<DeviceConnectionIndicator position={position()} />);
    expect(status()).toHaveClass('device-connection--online');
  });

  it('does not refresh the deadline from status feedback or an SSE snapshot replay', () => {
    const initial = position();
    const { rerender } = render(<DeviceConnectionIndicator position={initial} />);
    act(() => vi.advanceTimersByTime(2000));
    rerender(<DeviceConnectionIndicator position={{ ...initial, receivedAtMs: Date.now(), battery: 33 }} />);
    act(() => vi.advanceTimersByTime(1001));
    expect(status()).toHaveClass('device-connection--offline');
    rerender(<DeviceConnectionIndicator position={{ ...initial, receivedAtMs: Date.now() }} />);
    expect(status()).toHaveClass('device-connection--offline');
  });

  it('uses the remaining lifetime of an existing coordinate rather than starting a new 3-second window', () => {
    render(<DeviceConnectionIndicator position={position({ positionUpdatedAtMs: Date.now() - 2500 })} />);
    act(() => vi.advanceTimersByTime(500));
    expect(status()).toHaveClass('device-connection--online');
    act(() => vi.advanceTimersByTime(1));
    expect(status()).toHaveClass('device-connection--offline');
  });

  it.each([
    undefined,
    position({ positionUpdatedAtMs: undefined }),
    position({ positionUpdatedAtMs: 0 }),
    position({ positionUpdatedAtMs: NaN }),
    position({ positionUpdatedAtMs: 'invalid' }),
    position({ lat: null, lng: null }),
    position({ lat: 0, lng: 0 }),
    position({ lat: 91 }),
  ])('stays off without valid coordinates and their own receive timestamp: %j', (value) => {
    render(<DeviceConnectionIndicator position={value} />);
    expect(status()).toHaveClass('device-connection--offline');
    expect(status()).toHaveTextContent('关机');
  });

  it('does not carry over the previous device connection state', () => {
    const { rerender } = render(<DeviceConnectionIndicator position={position()} />);
    rerender(<DeviceConnectionIndicator position={position({ robotName: 'USV-002', positionUpdatedAtMs: Date.now() - 10000 })} />);
    expect(status()).toHaveClass('device-connection--offline');
    rerender(<DeviceConnectionIndicator position={position({ robotName: 'USV-003' })} />);
    expect(status()).toHaveClass('device-connection--online');
  });

  it('rechecks when returning to a backgrounded page and cleans up its timer', () => {
    const { unmount } = render(<DeviceConnectionIndicator position={position()} />);
    vi.setSystemTime(new Date(Date.now() + 10000));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(status()).toHaveClass('device-connection--offline');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
