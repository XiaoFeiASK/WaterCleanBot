import { describe, expect, it } from 'vitest';
import {
  getImportedRoutes,
  getShorelineSections,
  getShorelineWarnings,
  readShorelineFiles,
  validateShorelineFiles,
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

  it('rejects incorrect file types, duplicate files, illegal coordinates, and overlarge input', async () => {
    await expect(readShorelineFiles([selectedFile('left_waypoints_lonlat.json', referenceDocument('left'))]))
      .rejects.toThrow(/shoreline_lonlat/);
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
      ['left', '规划航线', '#ff963b'],
      ['center', '感知航线', '#ffc928'],
      ['right', '规划航线', '#36c7f4'],
    ]);
    expect(routes.map(({ segments }) => segments.map((segment) => segment.length))).toEqual([
      [2, 1, 1], [2, 1, 1], [2, 1, 1],
    ]);
    expect(routes[0].segments[0].map(({ seq }) => seq)).toEqual([1, 2]);
    expect(routes[0].segments[0][0]).toMatchObject({ seq: 1, pointId: 1 });
    expect(routes[0].lengthMeters).toBeGreaterThan(0);
    expect(routes[0].durationSeconds).toBeNull();
  });

  it('deletes only the selected imported route and preserves shoreline and sibling routes', () => {
    const files = fullFiles();
    const next = withoutImportedRoute(files, 'center');
    expect(next).toEqual({ shoreline: files.shoreline, left: files.left, right: files.right });
    expect(files.center).toBeDefined();
    expect(() => withoutImportedRoute(files, 'shoreline')).toThrow(/只能删除导入的航线/);
  });

  it('reports partial, unverified, and non-navigation warnings', () => {
    expect(getShorelineWarnings({
      shoreline: shorelineDocument({ state: 'partial', geographic_accuracy_verified: false }),
      center: referenceDocument('center', { navigation_valid: false }),
    })).toEqual(['包含部分结果', '测绘精度未独立验证', '参考线未全部通过通行核验']);
  });
});
