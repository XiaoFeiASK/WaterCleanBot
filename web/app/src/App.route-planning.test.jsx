// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App, { LocationMap } from './App';
import {
  createRobotRoute, fetchRobotCameras, fetchRobotLocation, fetchRobotRoutes,
  fetchRobotTracks, subscribeRobotLocations,
} from './api';

vi.mock('./api', async (original) => ({
  ...(await original()),
  createRobotRoute: vi.fn(),
  fetchRobotCameras: vi.fn(),
  fetchRobotLocation: vi.fn(),
  fetchRobotRoutes: vi.fn(),
  fetchRobotTracks: vi.fn(),
  subscribeRobotLocations: vi.fn(),
}));
vi.mock('./shoreline-api', () => ({ fetchShoreline: vi.fn(async () => null) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { displayName: '测试', username: 'tester' }, signOut: vi.fn() }) }));

let maps;
let lines;
let markers;
let streamHandlers;
const empty = [];
const position = {
  robotName: 'USV-001', lat: 31.2, lng: 121.4, heading: 90, speed: 1.2,
  sourceTimestampMs: 1000, receivedAtMs: 1000,
};
const points = [
  { lng: 121.41, lat: 31.21, speedKnots: 2 },
  { lng: 121.42, lat: 31.22, speedKnots: 3.5 },
  { lng: 121.43, lat: 31.23, speedKnots: 4 },
];
const defaults = { position, centerSeq: 0, perceptionRoutePoints: empty };
const pathOf = (routePoints) => routePoints.map(({ lng, lat }) => [lng, lat]);
const activeMarkers = () => markers.filter((marker) => marker.options.zIndex === 120 && !marker.removed);
const activeLine = (color = '#18a999') => lines.findLast((line) => line.options.strokeColor === color && !line.removed);

class Events {
  listeners = new Map();
  on(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  off(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event) { [...(this.listeners.get(name) || [])].forEach((callback) => callback(event)); }
}

beforeEach(() => {
  maps = [];
  lines = [];
  markers = [];
  window.localStorage.clear();
  vi.clearAllMocks();
  subscribeRobotLocations.mockImplementation((callbacks) => { streamHandlers = callbacks; return () => {}; });
  fetchRobotLocation.mockResolvedValue(position);
  fetchRobotTracks.mockResolvedValue([]);
  fetchRobotRoutes.mockResolvedValue([]);
  fetchRobotCameras.mockResolvedValue([]);
  window.AMap = {
    Map: class extends Events {
      constructor() {
        super();
        this.resize = vi.fn();
        this.destroy = vi.fn();
        this.setCenter = vi.fn();
        maps.push(this);
      }
    },
    TileLayer: { Satellite: class {}, RoadNet: class {} },
    Pixel: class {},
    Marker: class extends Events {
      constructor(options) {
        super();
        this.options = options;
        this.setMap = vi.fn((map) => { this.removed = map === null; });
        this.setPosition = vi.fn();
        markers.push(this);
      }
      getPosition() { return { lng: this.options.position[0], lat: this.options.position[1] }; }
    },
    Polyline: class {
      constructor(options) {
        this.options = options;
        this.setPath = vi.fn();
        this.setMap = vi.fn((map) => { this.removed = map === null; });
        lines.push(this);
      }
    },
  };
});
afterEach(() => {
  cleanup();
  delete window.AMap;
  vi.restoreAllMocks();
});

describe('route map editing', () => {
  it('drags confirmed points with a following line and survives telemetry updates while leaving the pending point fixed', async () => {
    const onMove = vi.fn();
    const pending = { lng: 121.44, lat: 31.24 };
    const props = { ...defaults, planningMode: true, draftRoutePoints: points, pendingRoutePoint: pending, onRoutePointMove: onMove };
    const { rerender } = render(<LocationMap {...props} />);
    await waitFor(() => expect(activeMarkers()).toHaveLength(4));
    const originalMarkers = activeMarkers();
    expect(originalMarkers.map((marker) => marker.options.draggable)).toEqual([true, true, true, false]);
    expect(originalMarkers.every((marker) => marker.options.bubble === false)).toBe(true);
    const line = activeLine();
    expect(line.options.path).toEqual(pathOf([...points, pending]));
    const moved = { lng: 121.425, lat: 31.225 };
    act(() => originalMarkers[1].emit('dragging', { lnglat: moved }));
    expect(line.setPath).toHaveBeenLastCalledWith(pathOf([points[0], moved, points[2], pending]));
    expect(onMove).not.toHaveBeenCalled();

    rerender(<LocationMap {...props} position={{ ...position, lng: 121.401 }} />);
    await waitFor(() => expect(markers[0].setPosition).toHaveBeenCalled());
    expect(activeMarkers()).toEqual(originalMarkers);
    originalMarkers.forEach((marker) => expect(marker.setMap).not.toHaveBeenCalledWith(null));
    act(() => originalMarkers[1].emit('dragend', { lnglat: moved }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith(1, moved);
  });

  it('shows saved and perception routes using only waypoints with non-draggable markers', async () => {
    render(<LocationMap {...defaults} previewRoutePoints={points} perceptionRoutePoints={points} onRoutePointMove={vi.fn()} />);
    await waitFor(() => expect(activeMarkers()).toHaveLength(3));
    expect(activeLine('#0b7a6f').options.path).toEqual(pathOf(points));
    expect(activeMarkers().every((marker) => marker.options.draggable === false)).toBe(true);
    const perceptionLines = lines.filter((line) => ['#5b4300', '#ffc928'].includes(line.options.strokeColor));
    expect(perceptionLines).toHaveLength(2);
    perceptionLines.forEach((line) => expect(line.options.path).toEqual(pathOf(points)));
    expect(markers.filter((marker) => marker.options.zIndex === 130).every((marker) => !marker.options.draggable)).toBe(true);
  });

  it('ignores invalid drag coordinates and detaches handlers after leaving planning mode', async () => {
    const onMove = vi.fn();
    const { rerender } = render(<LocationMap {...defaults} planningMode draftRoutePoints={points} onRoutePointMove={onMove} />);
    await waitFor(() => expect(activeMarkers()).toHaveLength(3));
    const marker = activeMarkers()[0];
    const lateDragEnd = [...marker.listeners.get('dragend')][0];
    for (const lnglat of [{ lng: NaN, lat: 31 }, { lng: 181, lat: 31 }, { lng: 121, lat: -91 }]) {
      act(() => marker.emit('dragend', { lnglat }));
    }
    expect(onMove).not.toHaveBeenCalled();
    expect(activeLine().setPath).not.toHaveBeenCalled();
    rerender(<LocationMap {...defaults} onRoutePointMove={onMove} />);
    expect(marker.setMap).toHaveBeenCalledWith(null);
    expect(marker.listeners.get('dragend').size).toBe(0);
    expect(marker.listeners.get('dragging').size).toBe(0);
    act(() => lateDragEnd({ lnglat: points[1] }));
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('planning state and persistence', () => {
  it('updates the summary after dragging and saves moved coordinates in the original order with original speeds', async () => {
    window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
    createRobotRoute.mockImplementation(async (_robot, route) => ({ ...route, id: 'new-route', name: '航线 1', lengthMeters: 200, durationSeconds: 100 }));
    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => streamHandlers.onSnapshot([position]));
    fireEvent.click(await screen.findByRole('button', { name: '规划航线' }));
    await waitFor(() => expect(maps.length).toBeGreaterThan(0));
    const map = maps.findLast((item) => item.listeners.get('click')?.size);
    act(() => map.emit('click', { lnglat: points[0] }));
    fireEvent.click(await screen.findByRole('button', { name: '确认航点', exact: true }));
    await waitFor(() => expect(activeMarkers()).toHaveLength(1));
    expect(activeLine()).toBeUndefined();
    expect(screen.getByText(/当前 1 个点，长度 0 m，预计 0分钟/)).toBeTruthy();

    act(() => map.emit('click', { lnglat: points[1] }));
    const dialog = await screen.findByRole('dialog', { name: '确认航点速度' });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '3.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确认航点', exact: true }));
    await waitFor(() => expect(activeMarkers()).toHaveLength(2));
    const oldSummary = screen.getByText(/点击地图添加航点/).textContent;
    const moved = { lng: 121.419, lat: 31.219 };
    act(() => activeMarkers()[0].emit('dragend', { lnglat: { getLng: () => moved.lng, getLat: () => moved.lat } }));
    await waitFor(() => expect(activeLine().options.path).toEqual(pathOf([moved, points[1]])));
    expect(screen.getByText(/点击地图添加航点/).textContent).not.toBe(oldSummary);
    fireEvent.click(screen.getByRole('button', { name: '保存航线' }));
    await waitFor(() => expect(createRobotRoute).toHaveBeenCalledExactlyOnceWith('USV-001', {
      type: '折线', coordinateSystem: 'GCJ02',
      points: [{ ...points[0], ...moved }, points[1]],
    }));
    await waitFor(() => expect(activeLine('#0b7a6f')?.options.path).toEqual(pathOf([moved, points[1]])));
    expect(activeMarkers()).toHaveLength(2);
    expect(activeMarkers().every((marker) => marker.options.draggable === false)).toBe(true);
  });
});
