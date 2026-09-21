// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TotalDistanceDisplay } from './App';

afterEach(cleanup);

describe('total distance display', () => {
  it('formats total distance in meters and kilometers', () => {
    const { rerender } = render(<TotalDistanceDisplay value={326.4} />);
    expect(screen.getByLabelText('总航程').textContent).toContain('326.4 m');

    rerender(<TotalDistanceDisplay value={18250.7} />);
    expect(screen.getByLabelText('总航程').textContent).toContain('18.25 km');
  });

  it('shows an empty state before distance feedback arrives', () => {
    render(<TotalDistanceDisplay />);
    expect(screen.getByLabelText('总航程').textContent).toContain('暂无数据');
  });
});
