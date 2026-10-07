// Recharts draws SVG attributes, which can't read CSS variables, so charts get
// their colours from here based on the active theme.
export const CHART_THEME = {
  dark: {
    axis: '#4A5380',
    tick: '#8A93B8',
    grid: '#232B52',
    muted: '#2E3866',
    solved: '#34D399',
    violet: '#8B5CF6',
    cyan: '#22D3EE',
    status: { Solved: '#34D399', 'In Progress': '#FBBF24', 'Need Revision': '#F87171', 'Not Started': '#4A5380' },
  },
  light: {
    axis: '#8F97B6',
    tick: '#555E82',
    grid: '#E4E8F4',
    muted: '#D3D9EC',
    solved: '#059669',
    violet: '#7C3AED',
    cyan: '#0891B2',
    status: { Solved: '#10B981', 'In Progress': '#F59E0B', 'Need Revision': '#EF4444', 'Not Started': '#C5CCE3' },
  },
};

export const tooltipStyle = {
  contentStyle: { background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 12, color: 'var(--color-ink)' },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--color-ink)' },
  cursor: { fill: 'rgb(139 92 246 / 0.08)' },
};
