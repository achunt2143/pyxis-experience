// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The theme AppShell reads, driven by the test.
let setTheme: (t: 'light' | 'dark') => void = () => {};
vi.mock('../../../packages/app-sdk/src/usePyxisTheme', () => ({
  usePyxisTheme: () => {
    const [theme, set] = useState<'light' | 'dark'>('light');
    setTheme = set;
    return theme;
  },
}));

import { AppShell } from '../../../packages/app-sdk/src/AppShell';

const Counter: React.FC = () => {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      count {n}
    </button>
  );
};

describe('AppShell', () => {
  it('follows a theme change without rebuilding the app', () => {
    const { container } = render(
      <AppShell>
        <Counter />
      </AppShell>
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('count 2');
    expect(container.querySelector('.mochi-theme-light')).not.toBeNull();

    act(() => setTheme('dark'));

    // The app kept its state, and remochi's wrapper took the new theme.
    expect(screen.getByRole('button').textContent).toBe('count 2');
    expect(container.querySelector('.mochi-theme-dark')).not.toBeNull();

    act(() => setTheme('light'));
    expect(screen.getByRole('button').textContent).toBe('count 2');
    expect(container.querySelector('.mochi-theme-light')).not.toBeNull();
  });
});
