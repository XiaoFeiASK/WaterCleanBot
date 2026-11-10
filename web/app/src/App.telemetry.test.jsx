// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { fetchRobotCameras, fetchRobotLocation, fetchRobotRoutes, fetchRobotTracks, fetchRouteTrackingStats, subscribeRobotLocations } from './api';
import { fetchShoreline } from './shoreline-api';

vi.mock('./api', async (original) => ({
  ...(await original()),
  fetchRobotCameras: vi.fn(),
  fetchRobotLocation: vi.fn(),
  fetchRobotRoutes: vi.fn(),
  fetchRobotTracks: vi.fn(),
  fetchRouteTrackingStats: vi.fn(),
  subscribeRobotLocations: vi.fn(),
}));
vi.mock('./shoreline-api', () => ({ fetchShoreline: vi.fn(), updateShoreline: vi.fn() }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { displayName: '测试', username: 'tester' }, signOut: vi.fn() }) }));

const position = {
  robotName: 'USV-001', lat: 31.2, lng: 121.4, heading: 90, speed: 1.028888, speedKnots: 2,
  battery: 77, distanceKm: 0, controlMode: 2, sourceTimestampMs: 1000, receivedAtMs: 1000,
};

let streamHandlers;
let markerContents;

class Events {
  listeners = new Map();
  on(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  off(name, callback) { this.listeners.get(name)?.delete(callback); }
}

beforeEach(() => {
  markerContents = [];
  window.localStorage.clear();
  window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.clearAllMocks();
  subscribeRobotLocations.mockImplementation((callbacks) => { streamHandlers = callbacks; return () => {}; });
  fetchRobotLocation.mockResolvedValue(position);
  fetchRobotTracks.mockResolvedValue([]);
  fetchRouteTrackingStats.mockResolvedValue([]);
  fetchRobotRoutes.mockResolvedValue([]);
  fetchShoreline.mockResolvedValue(null);
  fetchRobotCameras.mockResolvedValue([]);
  window.AMap = {
    Map: class extends Events { constructor() { super(); this.resize = vi.fn(); this.destroy = vi.fn(); this.setCenter = vi.fn(); } },
    TileLayer: { Satellite: class {}, RoadNet: class {} },
    Pixel: class {},
    Marker: class extends Events {
      constructor(options = {}) {
        super();
        this.options = options;
        this.setMap = vi.fn();
        this.setPosition = vi.fn();
        if (options.content) markerContents.push(options.content);
      }
    },
    Polyline: class { constructor() { this.setMap = vi.fn(); } },
  };
});

afterEach(() => {
  cleanup();
  delete window.AMap;
  vi.restoreAllMocks();
});

describe('device telemetry overlay', () => {
  it('stays hidden until the boat is clicked, then collapses, expands, and toggles speed', async () => {
    window.matchMedia.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(<MemoryRouter><App /></MemoryRouter>);
    await vi.waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => streamHandlers.onSnapshot([position]));
    await waitFor(() => expect(markerContents.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: '展开设备实时状态' })).toBeNull();

    fireEvent.click(markerContents.find((content) => content.classList.contains('fleet-map-marker')));
    const expandButton = await screen.findByRole('button', { name: '展开设备实时状态' });
    expect(document.getElementById('device-telemetry-body').hidden).toBe(true);
    const compactSpeed = screen.getByRole('button', { name: /航速 2.0 节，点击切换为m\/s/ });
    fireEvent.click(compactSpeed);
    expect(screen.getByRole('button', { name: /航速 1.0 m\/s，点击切换为节/ })).toBeTruthy();

    fireEvent.click(expandButton);
    expect(screen.getByRole('button', { name: '收起设备实时状态' })).toBeTruthy();
    expect(document.getElementById('device-telemetry-body').hidden).toBe(false);
    expect(screen.getByRole('button', { name: /航速 1.0 m\/s，点击切换为节/ })).toBeTruthy();
  });

  it('shows the overlay expanded after clicking the boat on desktop and formats values', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    await vi.waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => streamHandlers.onSnapshot([position]));
    await waitFor(() => expect(markerContents.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: '收起设备实时状态' })).toBeNull();

    fireEvent.click(markerContents.find((content) => content.classList.contains('fleet-map-marker')));
    await waitFor(() => expect(screen.getByRole('button', { name: '收起设备实时状态' })).toBeTruthy());
    const telemetryBody = document.getElementById('device-telemetry-body');
    expect(telemetryBody.hidden).toBe(false);
    expect(within(telemetryBody).getByText('0.00 km')).toBeTruthy();
    expect(within(telemetryBody).getByText('应用端')).toBeTruthy();
  });
});
