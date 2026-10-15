// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import nearBankWaypoints from './data/near_bank_waypoints_lonlat.json';
import { DEMO_NEAR_BANK_REFERENCE_SECTIONS } from './demoData';
import { getNearBankReferenceSections } from './shorelines';
import { createFleetMarkerContent, getPerceptionRouteMapPath, getPlanningPreviewMapPoints } from './App';

const boat = { lng: 121.429487, lat: 31.289906 };
const perceptionPoints = [
  { lng: 121.4296045, lat: 31.2889969 },
  { lng: 121.4296029, lat: 31.2892567 },
];

describe('perception route map path', () => {
  it('connects the boat position to the first perception point', () => {
    expect(getPerceptionRouteMapPath(boat, perceptionPoints)).toEqual([boat, ...perceptionPoints]);
  });

  it('keeps the raw perception points when the boat position is unknown', () => {
    expect(getPerceptionRouteMapPath(null, perceptionPoints)).toEqual(perceptionPoints);
  });

  it('returns an empty path when there are no perception points', () => {
    expect(getPerceptionRouteMapPath(boat, [])).toEqual([]);
  });
});

describe('planning route instant preview', () => {
  it('includes the boat, confirmed points and the pending point in order', () => {
    const confirmed = [{ lng: 1, lat: 1 }];
    const pending = { lng: 2, lat: 2 };
    expect(getPlanningPreviewMapPoints(boat, confirmed, pending)).toEqual([boat, ...confirmed, pending]);
  });

  it('drops the pending point once it is cancelled', () => {
    const confirmed = [{ lng: 1, lat: 1 }];
    expect(getPlanningPreviewMapPoints(boat, confirmed, null)).toEqual([boat, ...confirmed]);
  });

  it('still connects the boat to confirmed points when there is no pending point', () => {
    expect(getPlanningPreviewMapPoints(boat, [], null)).toEqual([boat]);
  });
});

describe('fleet marker content', () => {
  it('renders only the boat icon without the hover detail bubble', () => {
    const content = createFleetMarkerContent({ robotName: 'USV-001', heading: 90, battery: 88, lat: 31.2, lng: 121.4, speed: 0 }, () => {});
    expect(content.querySelector('.fleet-map-marker-icon')).toBeTruthy();
    expect(content.querySelector('.fleet-map-marker-bubble')).toBeNull();
    expect(content.querySelector('.fleet-map-marker-details')).toBeNull();
    expect(content.querySelector('.fleet-map-marker-name')).toBeNull();
    expect(content.querySelector('.fleet-map-marker-battery')).toBeNull();
  });

  it('still rotates the boat icon to the reported heading', () => {
    const content = createFleetMarkerContent({ robotName: 'USV-001', heading: 90, battery: 88, lat: 31.2, lng: 121.4, speed: 0 });
    const boatIcon = content.querySelector('.fleet-map-marker-boat');
    expect(boatIcon).toBeTruthy();
    expect(boatIcon.getAttribute('style')).toContain('--fleet-heading');
  });

  it('supports the compact marker geometry used by the live location map', () => {
    const content = createFleetMarkerContent({ robotName: 'USV-001', heading: 90 }, undefined, { compact: true });
    expect(content.classList.contains('fleet-map-marker-compact')).toBe(true);
    expect(content.querySelector('.fleet-map-marker-icon').style.bottom).toBe('');
  });
});

describe('near-bank reference overlay', () => {
  it('preserves all 36 WGS84 points in separate left and right reference lines', () => {
    expect(nearBankWaypoints.datum).toBe('WGS84');
    expect(DEMO_NEAR_BANK_REFERENCE_SECTIONS).toHaveLength(2);
    for (const [index, route] of nearBankWaypoints.routes.entries()) {
      expect(DEMO_NEAR_BANK_REFERENCE_SECTIONS[index]).toMatchObject({
        side: route.side,
        kind: 'near-bank-reference',
        points: route.points.map((point) => [point.longitude_deg, point.latitude_deg]),
      });
    }
    expect(DEMO_NEAR_BANK_REFERENCE_SECTIONS.map((section) => section.points.length)).toEqual([19, 17]);
  });

  it('uses reference connectivity even when the navigation link is unverified', () => {
    const points = nearBankWaypoints.routes[0].points.slice(0, 2);
    expect(points[1].can_connect_previous).toBe(false);
    expect(points[1].reference_can_connect_previous).toBe(true);
    const sections = getNearBankReferenceSections({ routes: [{ bank_name: 'left', side: 1, points }] });
    expect(sections).toHaveLength(1);
    expect(sections[0].points).toHaveLength(2);
  });

  it('keeps gaps and reference segment boundaries disconnected', () => {
    const point = nearBankWaypoints.routes[0].points[0];
    const points = [
      point,
      { ...point, reference_can_connect_previous: false },
      { ...point, reference_can_connect_previous: true, reference_segment_id: 2 },
      { ...point, reference_can_connect_previous: true, reference_segment_id: 2 },
    ];
    const sections = getNearBankReferenceSections({ routes: [{ bank_name: 'left', side: 1, points }] });
    expect(sections.map((section) => section.points.length)).toEqual([1, 1, 2]);
    expect(new Set(sections.map((section) => section.id)).size).toBe(3);
  });
});
