// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createFleetMarkerContent, getPerceptionRouteMapPath, getPlanningPreviewMapPoints } from './App';

const perceptionPoints = [
  { lng: 121.4296045, lat: 31.2889969 },
  { lng: 121.4296029, lat: 31.2892567 },
];

describe('perception route map path', () => {
  it('starts at the first perception point', () => {
    expect(getPerceptionRouteMapPath(perceptionPoints)).toEqual(perceptionPoints);
  });

  it('returns an empty path when perception points are missing', () => {
    expect(getPerceptionRouteMapPath()).toEqual([]);
  });

  it('returns an empty path when there are no perception points', () => {
    expect(getPerceptionRouteMapPath([])).toEqual([]);
  });
});

describe('planning route instant preview', () => {
  it('connects confirmed points and the pending point in order', () => {
    const confirmed = [{ lng: 1, lat: 1 }];
    const pending = { lng: 2, lat: 2 };
    expect(getPlanningPreviewMapPoints(confirmed, pending)).toEqual([...confirmed, pending]);
  });

  it('drops the pending point once it is cancelled', () => {
    const confirmed = [{ lng: 1, lat: 1 }];
    expect(getPlanningPreviewMapPoints(confirmed, null)).toEqual(confirmed);
  });

  it('does not create a path before any waypoint is added', () => {
    expect(getPlanningPreviewMapPoints([], null)).toEqual([]);
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

  it('opens the live status panel when the boat marker is clicked', () => {
    const onBoatClick = vi.fn();
    const content = createFleetMarkerContent({ robotName: 'USV-001', heading: 90 }, onBoatClick);
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onBoatClick).toHaveBeenCalledWith('USV-001');
    expect(content.getAttribute('role')).toBe('button');
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
