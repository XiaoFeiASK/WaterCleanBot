// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { LocationCoordinates, TotalDistanceDisplay } from './App';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('total distance display', () => {
  it('formats total distance in kilometers', () => {
    const { rerender } = render(<TotalDistanceDisplay value={0.4} />);
    expect(screen.getByLabelText('总航程').textContent).toContain('0.40 km');

    rerender(<TotalDistanceDisplay value={326.4} />);
    expect(screen.getByLabelText('总航程').textContent).toContain('326.40 km');

    rerender(<TotalDistanceDisplay value={18250.7} />);
    expect(screen.getByLabelText('总航程').textContent).toContain('18250.70 km');
  });

  it('shows an empty state before distance feedback arrives', () => {
    render(<TotalDistanceDisplay />);
    expect(screen.getByLabelText('总航程').textContent).toContain('暂无数据');
  });
});


describe('last known location display', () => {
  it('keeps last coordinates when updates stop and does not refresh their age from status feedback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    const position = { lat: 31.28822445, lng: 121.42776104, positionUpdatedAtMs: Date.now(), receivedAtMs: Date.now() };
    const { rerender } = render(<LocationCoordinates position={position} />);
    expect(screen.getByLabelText('设备经纬度').textContent).toContain('31.28822445, 121.42776104');
    expect(screen.getByText(/最近定位/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(35000));
    expect(screen.getByText(/最后有效位置（非实时）/)).toBeTruthy();
    const lastLocationText = screen.getByLabelText('设备经纬度').textContent;
    rerender(<LocationCoordinates position={{ ...position, receivedAtMs: Date.now(), battery: 33 }} />);
    expect(screen.getByLabelText('设备经纬度').textContent).toBe(lastLocationText);
    rerender(<LocationCoordinates position={{ ...position, positionUpdatedAtMs: Date.now(), lat: 31.30000001 }} />);
    expect(screen.getByText(/最近定位/)).toBeTruthy();
    expect(screen.getByLabelText('设备经纬度').textContent).toContain('31.30000001, 121.42776104');
  });

  it('shows no location for an unknown or legacy zero fix and labels offline coordinates as historical', () => {
    const { rerender } = render(<LocationCoordinates position={{ lat: 0, lng: 0 }} />);
    expect(screen.getByText('尚无有效定位')).toBeTruthy();
    expect(screen.queryByText('0, 0')).toBeNull();
    rerender(<LocationCoordinates position={{ lat: null, lng: null }} />);
    expect(screen.getByText('尚无有效定位')).toBeTruthy();
    rerender(<LocationCoordinates position={{ lat: 31.28822445, lng: 121.42776104, positionUpdatedAtMs: Date.now(), heartbeatStatus: 'offline' }} />);
    expect(screen.getByText(/最后有效位置（非实时）/)).toBeTruthy();
    expect(screen.getByText('31.28822445, 121.42776104')).toBeTruthy();
  });
});
