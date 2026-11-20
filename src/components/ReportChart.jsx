import { Box, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChartBar, ChartPie, TrendingUp } from 'lucide-react';
import { useId } from 'react';
import { fmtNum } from '../lib/format';

export function groupChartRows(rows, getLabel, getValue = () => 1) {
  const groups = new Map();
  for (const row of rows) {
    const label = getLabel(row);
    const value = Number(getValue(row));
    if (label && Number.isFinite(value)) groups.set(label, (groups.get(label) ?? 0) + value);
  }
  return [...groups].map(([label, value]) => ({ label, value }));
}

const seriesColors = ['#1769aa', '#16734a', '#a34b0a', '#7253a0', '#b42336', '#407985', '#506077', '#986047'];

function Trend({ points, format, accent }) {
  const gradientId = useId();
  const min = Math.min(0, ...points.map((point) => point.value));
  const max = Math.max(1, ...points.map((point) => point.value));
  const coordinates = points.map(({ value }, index) => [
    points.length === 1 ? 200 : 12 + 376 * index / (points.length - 1),
    94 - (value - min) / (max - min) * 82,
  ]);
  const line = coordinates.map((pair) => pair.join(',')).join(' ');
  return (
    <Box component="svg" viewBox="0 0 400 106" aria-hidden="true" sx={{ display: 'block', width: '100%', height: { xs: 100, sm: 136 }, mb: 1.25, color: accent, bgcolor: alpha(accent, 0.035), borderRadius: 1.5 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.2" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[15, 41, 67, 94].map((y) => <line key={y} x1="12" x2="388" y1={y} y2={y} stroke={alpha(accent, 0.18)} strokeDasharray="3 4" />)}
      {coordinates.length > 1 && <polygon points={`${coordinates[0][0]},94 ${line} ${coordinates.at(-1)[0]},94`} fill={`url(#${gradientId})`} />}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {coordinates.map(([x, y], index) => (
        <circle key={points[index].label} cx={x} cy={y} r="4" fill="white" stroke="currentColor" strokeWidth="2">
          <title>{points[index].label} · {format(points[index].value)}</title>
        </circle>
      ))}
    </Box>
  );
}

export default function ReportChart({ title, points, format = (value) => fmtNum(value, 0), chronological = false, donut = false, limit = chronological ? 12 : 8, accent = '#1769aa' }) {
  const values = [...points].sort(chronological
    ? (a, b) => a.label.localeCompare(b.label)
    : (a, b) => b.value - a.value);
  const visible = chronological ? values.slice(-limit) : values.slice(0, limit);
  const max = Math.max(1, ...visible.map(({ value }) => Math.abs(value)));
  const total = visible.reduce((sum, { value }) => sum + value, 0);
  const showDonut = donut && values.length === visible.length && total > 0 && visible.every(({ value }) => value >= 0);
  const Icon = chronological ? TrendingUp : showDonut ? ChartPie : ChartBar;
  let angle = 0;
  const slices = showDonut ? visible.map(({ value }, index) => {
    const start = angle;
    angle += value / total * 360;
    return `${seriesColors[index % seriesColors.length]} ${start}deg ${angle}deg`;
  }) : [];

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, minWidth: 0, height: '100%', borderRadius: 2.5, boxShadow: '0 2px 10px rgb(20 36 58 / 5%)' }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
        <Box sx={{ flexShrink: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 1, color: accent, bgcolor: alpha(accent, 0.1) }}>
          <Icon size={17} aria-hidden="true" />
        </Box>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 750, lineHeight: 1.3 }}>{title}</Typography>
      </Stack>
      {chronological && visible.length > 0 && <Trend points={visible} format={format} accent={accent} />}
      {visible.length ? (
        <Stack direction={showDonut ? { xs: 'column', sm: 'row' } : 'column'} useFlexGap gap={1.5} alignItems={showDonut ? { xs: 'center', sm: 'flex-start' } : 'stretch'}>
          {showDonut && <Box aria-hidden="true" sx={{
            flexShrink: 0, width: 108, height: 108, borderRadius: '50%',
            background: `conic-gradient(${slices.join(', ')})`, display: 'grid', placeItems: 'center',
            '&::after': { content: '""', width: 76, height: 76, borderRadius: '50%', bgcolor: 'background.paper' },
          }} />}
          <Box component="ul" sx={{
            p: 0, m: 0, minWidth: 0, width: '100%', listStyle: 'none',
            display: 'grid', gap: 0.5,
            gridTemplateColumns: chronological ? { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } : '1fr',
          }}>
            {visible.map(({ label, value }, index) => (
              <Box component="li" key={label} title={`${label} · ${format(value)}`} sx={{
                px: 1, py: 0.75, minWidth: 0, borderRadius: 1,
                bgcolor: chronological ? '#f6f8fb' : 'transparent', '&:hover': { bgcolor: alpha(accent, 0.08) },
              }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 0, color: 'text.secondary' }}>
                    {showDonut && <Box component="span" aria-hidden="true" sx={{ display: 'inline-block', width: 8, height: 8, mr: 0.75, borderRadius: '50%', bgcolor: seriesColors[index % seriesColors.length] }} />}
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', textAlign: 'right' }}>{format(value)}</Typography>
                </Stack>
                {!chronological && !showDonut && <Box aria-hidden="true" sx={{ mt: 0.75, height: 7, borderRadius: 2, bgcolor: alpha(accent, 0.09) }}>
                  <Box sx={{ width: `${Math.abs(value) / max * 100}%`, height: '100%', borderRadius: 2, bgcolor: value < 0 ? 'error.main' : accent }} />
                </Box>}
              </Box>
            ))}
          </Box>
        </Stack>
      ) : (
        <Box sx={{ py: 2, px: 1.5, borderRadius: 1.5, border: '1px dashed', borderColor: 'divider', bgcolor: '#f8fafc' }}>
          <Typography color="text.secondary" variant="body2">No matching data.</Typography>
        </Box>
      )}
      {values.length > visible.length && <Typography color="text.secondary" variant="caption" component="div" sx={{ mt: 1 }}>
        {chronological ? 'Latest' : 'Top'} {visible.length} of {values.length}
      </Typography>}
    </Paper>
  );
}
