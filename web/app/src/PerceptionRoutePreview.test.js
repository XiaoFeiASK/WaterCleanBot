// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getNextPerceptionPreview } from './App';

describe('perception route preview state', () => {
  it('is hidden by default and only shows after the first toggle', () => {
    expect(getNextPerceptionPreview(false)).toBe(true);
  });

  it('hides again when the user cancels viewing', () => {
    expect(getNextPerceptionPreview(true)).toBe(false);
  });
});
