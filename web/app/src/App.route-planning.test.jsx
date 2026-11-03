// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App, { LocationMap } from './App';
import {
  createRobotRoute, updateRobotRoute, fetchRobotCameras, fetchRobotLocation, fetchRobotRoutes, sendImportedRoute,
  fetchRobotTracks, subscribeRobotLocations,
} from './api';
import { fetchShoreline, updateShoreline } from './shoreline-api';

vi.mock('./api', async (original) => ({
  ...(await original()),
  createRobotRoute: vi.fn(),
  updateRobotRoute: vi.fn(),
  fetchRobotCameras: vi.fn(),
  fetchRobotLocation: vi.fn(),
  fetchRobotRoutes: vi.fn(),
  fetchRobotTracks: vi.fn(),
  sendImportedRoute: vi.fn(),
  subscribeRobotLocations: vi.fn(),
}));
vi.mock('./shoreline-api', () => ({ fetchShoreline: vi.fn(), updateShoreline: vi.fn() }));
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
  { lng: 121.41, lat: 31.21, speedKnots: 1 },
  { lng: 121.42, lat: 31.22, speedKnots: 3.5 },
  { lng: 121.43, lat: 31.23, speedKnots: 4 },
];
const defaults = { position, centerSeq: 0, perceptionRoutePoints: empty };
const pathOf = (routePoints) => routePoints.map(({ lng, lat }) => [lng, lat]);
const activeMarkers = () => markers.filter((marker) => marker.options.zIndex === 120 && !marker.removed);
const activeLine = (color = '#18a999') => lines.findLast((line) => line.options.strokeColor === color && !line.removed);
const importedMarkers = () => markers.filter((marker) => marker.options.zIndex === 130 && !marker.removed);

function shorelineDataset() {
  const common = { schema_version: 3, session_id: 'bundle-a', state: 'completed', datum: 'WGS84', valid: true, point_count: 2 };
  const coordinates = [
    { longitude_deg: 121.4, latitude_deg: 31.2 },
    { longitude_deg: 121.401, latitude_deg: 31.201 },
  ];
  const files = {
    shoreline: {
      ...common, contour_count: 1,
      contours: [{ contour_id: 1, side: 1, sections: [{ line_id: 1, contour_id: 1, section_order: 1, side: 1, kind: 1, points: coordinates }] }],
    },
  };
  for (const key of ['left', 'center', 'right']) {
    const center = key === 'center';
    const side = key === 'left' ? 1 : 0;
    files[key] = {
      ...common, route_name: key,
      planning_mode: center ? 'center_reference' : 'near_bank_reference',
      ...(center ? {} : { side, bank_name: key }),
      points: coordinates.map((point, index) => ({
        ...point, point_id: index + 1, reference_segment_id: 1, reference_can_connect_previous: index > 0,
        ...(center ? {} : { side, map_section: 1 }),
      })),
    };
  }
  return { revision: 'revision-1', files, updatedAt: '2026-10-22T10:00:00Z', uploadedBy: { displayName: '测试' } };
}

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
  Element.prototype.scrollIntoView = vi.fn();
  subscribeRobotLocations.mockImplementation((callbacks) => { streamHandlers = callbacks; return () => {}; });
  fetchRobotLocation.mockResolvedValue(position);
  fetchRobotTracks.mockResolvedValue([]);
  fetchRobotRoutes.mockResolvedValue([]);
  sendImportedRoute.mockResolvedValue({ protocol: [40, 2, 121.4, 31.2, 1.944, 121.5, 31.3, 1.944] });
  fetchRobotCameras.mockResolvedValue([]);
  fetchShoreline.mockResolvedValue(null);
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
  delete Element.prototype.scrollIntoView;
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
  it('edits and saves speeds for a previously saved route', async () => {
    window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
    const route = {
      id: 'R-001', robotName: 'USV-001', type: '折线', coordinateSystem: 'GCJ02',
      lengthMeters: 200, durationSeconds: 100,
      points: [
        { seq: 1, lng: 121.41, lat: 31.21, speedKnots: 2 },
        { seq: 2, lng: 121.42, lat: 31.22, speedKnots: 3.5 },
      ],
    };
    fetchRobotRoutes.mockResolvedValue([route]);
    updateRobotRoute.mockImplementation(async (_robot, _id, payload) => ({ ...route, ...payload, points: payload.points.map((point, index) => ({ ...point, seq: index + 1 })) }));
    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => streamHandlers.onSnapshot([position]));
    const row = await screen.findByText('R-001', { selector: 'td' });
    fireEvent.click(within(row.closest('tr')).getByRole('button', { name: '编辑', exact: true }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'R-001 航点 2 速度（节）' }), { target: { value: '4.2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存速度' }));

    await waitFor(() => expect(updateRobotRoute).toHaveBeenCalledWith('USV-001', 'R-001', {
      type: '折线', coordinateSystem: 'GCJ02',
      points: [
        { lng: 121.41, lat: 31.21, speedKnots: 2 },
        { lng: 121.42, lat: 31.22, speedKnots: 4.2 },
      ],
    }));
    expect(screen.queryByRole('group', { name: '编辑R-001各航点速度' })).toBeNull();
  });

  it('updates the summary after dragging and saves moved coordinates in the original order with original speeds', async () => {
    window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
    createRobotRoute.mockImplementation(async (_robot, route) => ({ ...route, id: 'new-route', name: '航线 1', lengthMeters: 200, durationSeconds: 100 }));
    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => streamHandlers.onSnapshot([position]));
    fireEvent.click(await screen.findByRole('button', { name: '规划航线' }));
    await waitFor(() => expect(maps.length).toBeGreaterThan(0));
    const map = maps.findLast((item) => item.listeners.get('click')?.size);
    act(() => map.emit('click', { lnglat: points[0] }));
    const firstPointDialog = await screen.findByRole('dialog', { name: '确认航点速度' });
    expect(within(firstPointDialog).getByRole('spinbutton').value).toBe('1.0');
    fireEvent.click(within(firstPointDialog).getByRole('button', { name: '确认航点', exact: true }));
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

describe('imported route visibility', () => {
  async function openDataset() {
    const dataset = shorelineDataset();
    fetchShoreline.mockResolvedValue(dataset);
    window.localStorage.setItem('watercleanbot.activePage', 'device-detail');
    render(<MemoryRouter><App /></MemoryRouter>);
    await act(async () => streamHandlers.onSnapshot([position]));
    await screen.findByText('中心感知航线');
    return dataset;
  }

  const routeRow = (name) => screen.getByText(name, { selector: 'strong' }).closest('tr');

  it('toggles only boundaries and shows a single explicitly selected route independently at 1 m/s', async () => {
    await openDataset();
    expect(importedMarkers()).toHaveLength(0);
    const boundaryButton = screen.getByRole('button', { name: '河道边界', exact: true });
    fireEvent.click(boundaryButton);
    await waitFor(() => expect(activeLine('#38ef9a')).toBeDefined());
    expect(importedMarkers()).toHaveLength(0);
    for (const name of ['左岸航线', '中心感知航线', '右岸航线']) {
      expect(within(routeRow(name)).getByRole('button', { name: '查看', exact: true })).toBeTruthy();
      expect(routeRow(name).textContent).toContain('1 m/s');
      expect(routeRow(name).textContent).not.toContain('暂无数据');
    }
    fireEvent.click(within(routeRow('中心感知航线')).getByRole('button', { name: '查看', exact: true }));
    await waitFor(() => expect(importedMarkers()).toHaveLength(2));
    expect(activeLine('#ffc928')).toBeDefined();
    expect(activeLine('#ff963b')).toBeUndefined();
    expect(activeLine('#36c7f4')).toBeUndefined();

    fireEvent.click(boundaryButton);
    await waitFor(() => expect(activeLine('#38ef9a')).toBeUndefined());
    expect(importedMarkers()).toHaveLength(2);
    fireEvent.click(boundaryButton);
    await waitFor(() => expect(activeLine('#38ef9a')).toBeDefined());
    expect(importedMarkers()).toHaveLength(2);

    fireEvent.click(within(routeRow('左岸航线')).getByRole('button', { name: '查看', exact: true }));
    await waitFor(() => expect(activeLine('#ff963b')).toBeDefined());
    expect(activeLine('#ffc928')).toBeUndefined();
    expect(importedMarkers()).toHaveLength(2);
    fireEvent.click(within(routeRow('左岸航线')).getByRole('button', { name: '取消查看', exact: true }));
    await waitFor(() => expect(importedMarkers()).toHaveLength(0));
    expect(activeLine('#38ef9a')).toBeDefined();
  });

  it('previews all uploaded routes temporarily, restores selection on cancel, and saves without auto-showing routes', async () => {
    const dataset = await openDataset();
    fireEvent.click(within(routeRow('中心感知航线')).getByRole('button', { name: '查看', exact: true }));
    await waitFor(() => expect(importedMarkers()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '岸线管理', exact: true }));
    const files = Object.entries(dataset.files).map(([key, data]) => new File(
      [JSON.stringify(data)], key === 'shoreline' ? 'shoreline_lonlat.json' : `${key}_waypoints_lonlat.json`, { type: 'application/json' },
    ));
    async function previewUpload() {
      fireEvent.change(screen.getByLabelText('选择多个岸线 JSON 文件'), { target: { files } });
      fireEvent.click(await screen.findByRole('button', { name: '地图预览', exact: true }));
      await waitFor(() => expect(importedMarkers()).toHaveLength(6));
    }
    await previewUpload();
    fireEvent.click(screen.getByRole('button', { name: '取消导入', exact: true }));
    await waitFor(() => expect(importedMarkers()).toHaveLength(2));
    expect(activeLine('#ffc928')).toBeDefined();
    expect(activeLine('#38ef9a')).toBeUndefined();

    await previewUpload();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    updateShoreline.mockResolvedValue({ ...dataset, revision: 'revision-2' });
    fireEvent.click(screen.getByRole('button', { name: '确认替换', exact: true }));
    await waitFor(() => expect(updateShoreline).toHaveBeenCalledExactlyOnceWith(
      dataset.files, dataset.revision,
    ));
    await waitFor(() => expect(importedMarkers()).toHaveLength(0));
    expect(activeLine('#38ef9a')).toBeDefined();
  });

  it('confirms and sends only the selected persisted public route to the active device', async () => {
    const dataset = await openDataset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(routeRow('中心感知航线')).getByRole('button', { name: '下发', exact: true }));
    await waitFor(() => expect(sendImportedRoute).toHaveBeenCalledExactlyOnceWith('USV-001', 'center', dataset.revision, false));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('默认速度为 1 m/s'));
  });

  it('dispatches the displayed route last point first after reversing it', async () => {
    const dataset = await openDataset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const row = routeRow('中心感知航线');
    fireEvent.click(within(row).getByRole('button', { name: '逆转', exact: true }));
    await waitFor(() => expect(within(row).getByRole('button', { name: '取消逆转', exact: true })).toBeTruthy());
    expect(screen.getByText(/已逆转/)).toBeTruthy();
    expect(importedMarkers().map((marker) => marker.options.title)).toEqual([
      expect.stringContaining('航点 1（原始编号 2）'),
      expect.stringContaining('航点 2（原始编号 1）'),
    ]);
    fireEvent.click(within(row).getByRole('button', { name: '下发', exact: true }));
    await waitFor(() => expect(sendImportedRoute).toHaveBeenCalledExactlyOnceWith('USV-001', 'center', dataset.revision, true));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('按逆转顺序'));
  });
});
