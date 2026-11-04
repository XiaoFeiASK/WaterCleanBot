import { describe, expect, it } from 'vitest';
import {
  getImportedRoutes,
  getRouteTypeLabel,
  getShorelineSections,
  getShorelineSession,
  getShorelineWarnings,
  mergeShorelineFiles,
  readShorelineFiles,
  reverseImportedRoute,
  validateShorelineFiles,
  withImportedRouteSpeeds,
  withoutImportedRoute,
} from './shorelines';

function shorelineDocument(overrides = {}) {
  return {
    schema_version: 3,
    session_id: 'bundle-a',
    state: 'completed',
    datum: 'WGS84',
    valid: true,
    contour_count: 1,
    point_count: 3,
    contours: [{
      contour_id: 7,
      side: 1,
      sections: [
        {
          line_id: 11,
          contour_id: 7,
          section_order: 2,
          side: 1,
          kind: 1,
          points: [
            { longitude_deg: 121.4, latitude_deg: 31.2 },
            { longitude_deg: 121.5, latitude_deg: 31.3 },
          ],
        },
        {
          line_id: 12,
          contour_id: 7,
          section_order: 1,
          side: 1,
          kind: 3,
          points: [{ longitude_deg: 121.3, latitude_deg: 31.1 }],
        },
      ],
    }],
    ...overrides,
  };
}

function referenceDocument(key, overrides = {}) {
  const center = key === 'center';
  const side = center ? undefined : key === 'left' ? 1 : 0;
  return {
    schema_version: 3,
    session_id: 'bundle-a',
    state: 'completed',
    datum: 'WGS84',
    valid: true,
    point_count: 4,
    route_name: key,
    planning_mode: center ? 'center_reference' : 'near_bank_reference',
    ...(center ? {} : { side, bank_name: key }),
    points: [
      { point_id: 1, longitude_deg: 121.4, latitude_deg: 31.2, reference_segment_id: 1, reference_can_connect_previous: false, ...(center ? {} : { side, map_section: 1 }) },
      { point_id: 2, longitude_deg: 121.41, latitude_deg: 31.21, reference_segment_id: 1, reference_can_connect_previous: true, ...(center ? {} : { side, map_section: 1 }) },
      { point_id: 3, longitude_deg: 121.42, latitude_deg: 31.22, reference_segment_id: 2, reference_can_connect_previous: true, ...(center ? {} : { side, map_section: 2 }) },
      { point_id: 4, longitude_deg: 121.43, latitude_deg: 31.23, reference_segment_id: 2, reference_can_connect_previous: false, ...(center ? {} : { side, map_section: 2 }) },
    ],
    ...overrides,
  };
}

function fullFiles() {
  return {
    shoreline: shorelineDocument(),
    left: referenceDocument('left'),
    center: referenceDocument('center'),
    right: referenceDocument('right'),
  };
}

function selectedFile(name, value, size = JSON.stringify(value).length) {
  return { name, size, text: async () => JSON.stringify(value) };
}

describe('public shoreline validation', () => {
  it('accepts shoreline-only and a complete four-file bundle', () => {
    expect(validateShorelineFiles({ shoreline: shorelineDocument() })).toHaveProperty('shoreline');
    expect(Object.keys(validateShorelineFiles(fullFiles()))).toEqual(['shoreline', 'left', 'center', 'right']);
  });

  it('accepts the v3 partial state but rejects recording, failed, invalid, and mixed sessions', () => {
    expect(() => validateShorelineFiles({ shoreline: shorelineDocument({ state: 'partial' }) })).not.toThrow();
    for (const state of ['recording', 'failed']) {
      expect(() => validateShorelineFiles({ shoreline: shorelineDocument({ state }) })).toThrow();
    }
    expect(() => validateShorelineFiles({ shoreline: shorelineDocument({ valid: false }) })).toThrow();
    expect(() => validateShorelineFiles({
      shoreline: shorelineDocument(),
      left: referenceDocument('left', { session_id: 'bundle-b' }),
    })).toThrow(/session_id/);
  });

  it('accepts independent route files and rejects incorrect file types, duplicate files, illegal coordinates, and overlarge input', async () => {
    await expect(readShorelineFiles([selectedFile('left_waypoints_lonlat.json', referenceDocument('left'))]))
      .resolves.toEqual({ left: referenceDocument('left') });
    await expect(readShorelineFiles([
      selectedFile('left_waypoints_lonlat.json', referenceDocument('left')),
      selectedFile('center_waypoints_lonlat.json', referenceDocument('center')),
    ])).resolves.toEqual({ left: referenceDocument('left'), center: referenceDocument('center') });
    await expect(readShorelineFiles([
      selectedFile('shoreline_lonlat.json', shorelineDocument()),
      selectedFile('shoreline_lonlat.json', shorelineDocument()),
    ])).rejects.toThrow(/重复文件类型/);
    await expect(readShorelineFiles([selectedFile('shoreline_lonlat.json', shorelineDocument({
      contours: [{ ...shorelineDocument().contours[0], sections: [{ ...shorelineDocument().contours[0].sections[0], points: [{ longitude_deg: 181, latitude_deg: 31.2 }, { longitude_deg: 121.5, latitude_deg: 31.3 }] }] }],
    }))])).rejects.toThrow(/经纬度/);
    await expect(readShorelineFiles([selectedFile('shoreline_lonlat.json', shorelineDocument(), 20 * 1024 * 1024 + 1)]))
      .rejects.toThrow(/20 MiB/);
  });
});

describe('public shoreline rendering', () => {
  it('returns no demo boundaries for an empty or deleted dataset', () => {
    for (const files of [null, undefined, {}]) expect(getShorelineSections(files)).toEqual([]);
  });

  it('sorts contour sections by section_order and keeps every contour independent', () => {
    const sections = getShorelineSections({ shoreline: {
      ...shorelineDocument(),
      contours: [
        shorelineDocument().contours[0],
        { contour_id: 8, side: 0, sections: [{ line_id: 20, contour_id: 8, section_order: 1, side: 0, kind: 1, points: [{ longitude_deg: 121.6, latitude_deg: 31.4 }] }] },
      ],
      contour_count: 2,
    } });
    expect(sections.slice(0, 3).map(({ id, kind, points }) => [id, kind, points.length])).toEqual([
      ['shore-7-12', 3, 1],
      ['shore-7-11', 1, 2],
      ['shore-8-20', 1, 1],
    ]);
  });

  it('renders only shoreline and bridge boundaries from shoreline_lonlat.json', () => {
    const sections = getShorelineSections(fullFiles());
    expect(sections.map(({ kind }) => kind)).toEqual([3, 1]);
  });

  it('turns the three waypoint files into separately styled routes with numbered, disconnected segments', () => {
    const routes = getImportedRoutes(fullFiles());
    expect(routes.map(({ sourceKey, type, color }) => [sourceKey, type, color])).toEqual([
      ['left', '智能岸线', '#ff963b'],
      ['center', '智能中线', '#ffc928'],
      ['right', '智能岸线', '#36c7f4'],
    ]);
    expect(routes.map(({ segments }) => segments.map((segment) => segment.length))).toEqual([
      [2, 1, 1], [2, 1, 1], [2, 1, 1],
    ]);
    expect(routes[0].segments[0].map(({ seq }) => seq)).toEqual([1, 2]);
    expect(routes[0].segments[0][0]).toMatchObject({ seq: 1, pointId: 1 });
    expect(routes[0].lengthMeters).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.speedMetersPerSecond).toBeCloseTo(1, 2);
      expect(route.points.every((point) => Math.abs(point.speedMetersPerSecond - 1) < 1e-6)).toBe(true);
      expect(route.segments.flat().every((point) => Math.abs(point.speedMetersPerSecond - 1) < 1e-6)).toBe(true);
      expect(route.durationSeconds).toBe(Math.ceil(route.lengthMeters));
    }
  });

  it('uses persisted per-point speeds and preserves all route metadata when editing', () => {
    const files = fullFiles();
    const edited = withImportedRouteSpeeds(files, 'left', [2.5, 4, 3, 5]);
    expect(edited.left.points.map((point) => point.speed_knots)).toEqual([2.5, 4, 3, 5]);
    expect(edited.left.points[0]).toMatchObject({
      point_id: files.left.points[0].point_id,
      reference_segment_id: files.left.points[0].reference_segment_id,
      side: files.left.points[0].side,
      map_section: files.left.points[0].map_section,
    });
    expect(edited.center).toBe(files.center);
    const route = getImportedRoutes(edited).find(({ sourceKey }) => sourceKey === 'left');
    expect(route.points.map((point) => point.speedKnots)).toEqual([2.5, 4, 3, 5]);
    expect(route.points[0].speedMetersPerSecond).toBeCloseTo(2.5 * 0.514444, 6);
  });

  it('estimates time at 1 m/s without counting disconnected gaps or changing the source JSON', () => {
    const files = fullFiles();
    const original = structuredClone(files);
    const route = files.center;
    const connected = getImportedRoutes({ center: route })[0];
    const firstSegmentOnly = getImportedRoutes({ center: { ...route, points: route.points.slice(0, 2) } })[0];
    expect(connected.durationSeconds).toBe(firstSegmentOnly.durationSeconds);
    expect(connected.lengthMeters).toBe(firstSegmentOnly.lengthMeters);
    expect(files).toEqual(original);
    const isolated = getImportedRoutes({ center: { ...route, points: route.points.map((point) => ({ ...point, reference_can_connect_previous: false })) } })[0];
    expect(isolated.lengthMeters).toBe(0);
    expect(isolated.durationSeconds).toBe(0);
  });

  it('deletes only the selected imported route and preserves shoreline and sibling routes', () => {
    const files = fullFiles();
    const next = withoutImportedRoute(files, 'center');
    expect(next).toEqual({ shoreline: files.shoreline, left: files.left, right: files.right });
    expect(files.center).toBeDefined();
    expect(() => withoutImportedRoute(files, 'shoreline')).toThrow(/只能删除导入的航线/);
  });

  it('reverses display order so the last point becomes the first without mutating the route', () => {
    const route = getImportedRoutes(fullFiles())[1];
    const reversed = reverseImportedRoute(route);
    expect(reversed.points.map(({ lat, lng }) => [lat, lng])).toEqual([...route.points].reverse().map(({ lat, lng }) => [lat, lng]));
    expect(reversed.segments.flat().map(({ seq }) => seq)).toEqual(reversed.segments.flat().map((_, index) => index + 1));
    expect(route.segments.flat().map(({ seq }) => seq)[0]).toBe(1);
  });

  it('merges one uploaded file while retaining the other official files', () => {
    const files = fullFiles();
    const replacement = referenceDocument('center', { point_count: 4, session_id: 'bundle-a' });
    const merged = mergeShorelineFiles(files, { center: replacement });
    expect(merged.shoreline).toEqual(files.shoreline);
    expect(merged.left).toEqual(files.left);
    expect(merged.center).toEqual(replacement);
    expect(merged.right).toEqual(files.right);
    expect(getShorelineSession(merged)).toBe('bundle-a');
  });

  it('reports partial, unverified, and non-navigation warnings', () => {
    expect(getShorelineWarnings({
      shoreline: shorelineDocument({ state: 'partial', geographic_accuracy_verified: false }),
      center: referenceDocument('center', { navigation_valid: false }),
    })).toEqual(['包含部分结果', '测绘精度未独立验证', '参考线未全部通过通行核验']);
  });

  it('maps legacy route types and unknown custom routes to the current names', () => {
    expect(['折线', '普通航线', '自定航线', undefined].map(getRouteTypeLabel)).toEqual([
      '自定航线', '自定航线', '自定航线', '自定航线',
    ]);
    expect(getRouteTypeLabel('规划航线')).toBe('智能岸线');
    expect(getRouteTypeLabel('感知航线')).toBe('智能中线');
  });
});
