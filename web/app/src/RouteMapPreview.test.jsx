// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
});
