// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LocationMap } from './App';
import { wgs84ToGcj02 } from './coordinates';

let maps;
let lines;
let markers;
const empty = [];
const bank = { kind: 1, side: 1, path: [[121.4, 31.2], [121.41, 31.21]] };
const reference = { kind: 'near-bank-reference', side: 1, path: [[121.42, 31.22], [121.43, 31.23]] };
const defaults = { position: null, centerSeq: 0, showShoreline: true, perceptionRoutePoints: empty };

beforeEach(() => {
  maps = [];
  lines = [];
  markers = [];
  window.AMap = {
    Map: class {
      constructor(node, options) {
        this.options = options;
        this.setFitView = vi.fn();
        this.setCenter = vi.fn();
        this.setZoom = vi.fn();
        this.setZoomAndCenter = vi.fn();
        this.resize = vi.fn();
        this.destroy = vi.fn();
        maps.push(this);
      }
    },
    TileLayer: { Satellite: class {} },
    Polyline: class {
      constructor(options) { this.options = options; this.setMap = vi.fn(); lines.push(this); }
    },
    Marker: class {
      constructor() { this.setMap = vi.fn(); this.setPosition = vi.fn(); markers.push(this); }
    },
    Pixel: class {},
  };
});

afterEach(() => {
  cleanup();
  delete window.AMap;
  vi.restoreAllMocks();
});

describe('public shoreline map lifecycle', () => {
  it('does not initialize a boat marker or center the map at an unavailable zero fix', () => {
    render(<LocationMap {...defaults} position={{ robotName: 'boat', lat: 0, lng: 0 }} shorelineSections={empty} />);
    expect(screen.getByText('暂无位置数据')).toBeTruthy();
    expect(maps).toHaveLength(0);
    expect(markers).toHaveLength(0);
  });
  it('starts from shoreline bounds without a device position and removes every old overlay on replacement or deletion', async () => {
    const { rerender } = render(<LocationMap {...defaults} shorelineSections={[bank, reference]} />);
    await waitFor(() => expect(lines).toHaveLength(2));
    expect(maps[0].options.center).toEqual(bank.path[0]);
    expect(maps[0].setFitView).toHaveBeenCalledWith(lines, true, [36, 36, 36, 36], 18);
    const oldLines = [...lines];
    const replacement = { ...bank, path: [[121.5, 31.3], [121.51, 31.31]] };
    rerender(<LocationMap {...defaults} shorelineSections={[replacement]} shorelineFitSeq={1} />);
    await waitFor(() => expect(lines).toHaveLength(3));
    oldLines.forEach((line) => expect(line.setMap).toHaveBeenCalledWith(null));
    expect(lines[2].options.path).toEqual(replacement.path);
    expect(maps[0].setFitView).toHaveBeenCalledTimes(2);

    rerender(<LocationMap {...defaults} shorelineSections={empty} shorelineFitSeq={1} />);
    await waitFor(() => expect(screen.getByText('暂无位置数据')).toBeTruthy());
    expect(lines[2].setMap).toHaveBeenCalledWith(null);
    expect(maps[0].destroy).toHaveBeenCalledOnce();
    expect(lines).toHaveLength(3);
  });

  it('preserves device tracking and other map layers when the public shoreline is deleted without refitting on telemetry', async () => {
    const position = { robotName: 'test-device', lng: 121.4, lat: 31.2 };
    const trackLines = [{ path: [[121.3, 31.1], [121.4, 31.2]], color: '#e5484d' }];
    const props = { ...defaults, position, trackLines, shorelineSections: [bank] };
    const { rerender } = render(<LocationMap {...props} />);
    await waitFor(() => expect(lines).toHaveLength(2));
    const originalBank = lines.find((line) => line.options.strokeColor === '#38ef9a');
    rerender(<LocationMap {...props} position={{ ...position, lng: 121.401 }} />);
    await waitFor(() => expect(markers[0].setPosition).toHaveBeenCalled());
    expect(maps[0].setFitView).toHaveBeenCalledOnce();
    expect(maps[0].setCenter).not.toHaveBeenCalled();

    rerender(<LocationMap {...props} shorelineSections={empty} />);
    await waitFor(() => expect(lines).toHaveLength(5));
    expect(originalBank.setMap).toHaveBeenCalledWith(null);
    expect(lines[4].options.strokeColor).toBe('#e5484d');
    expect(maps[0].destroy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('机器人实时位置地图')).toBeTruthy();
  });

  it('centers the boat and applies the focus zoom from one locate click', async () => {
    const position = { robotName: 'test-device', lng: 121.4, lat: 31.2 };
    render(<LocationMap {...defaults} showShoreline={false} position={position} />);
    await waitFor(() => expect(maps).toHaveLength(1));

    screen.getByRole('button', { name: '定位到小船' }).click();

    const focused = wgs84ToGcj02(position);
    expect(maps[0].setZoomAndCenter).toHaveBeenCalledWith(17, [focused.lng, focused.lat], false, 320);
    expect(maps[0].setFitView).not.toHaveBeenCalled();
  });
});
