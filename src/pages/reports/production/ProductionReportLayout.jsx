import { Box, Paper, Stack, Typography } from '@mui/material';

export const reportPageSx = { p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' };
export const reportSurfaceSx = { borderRadius: '12px', bgcolor: 'background.paper' };
export const reportFiltersSx = { ...reportSurfaceSx, p: 1.5, pt: 2, mb: 2.5 };
export const reportTableSx = { ...reportSurfaceSx, overflow: 'hidden' };
export const reportTableHeight = 650;
export const reportHeadingRowSx = {
  '& th': {
    bgcolor: '#f8fafc',
    color: '#475569',
    fontSize: '0.75rem',
    fontWeight: 700,
    py: 1.25,
    whiteSpace: 'nowrap',
  },
};
export const reportExportSx = {
  bgcolor: '#16734a',
  '&:hover': { bgcolor: '#15803d' },
};

export function ProductionReportHeader({ title, description, children }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2.5 }}>
      <Box>
        <Typography component="h1" variant="h5" sx={{ color: 'text.primary' }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
      </Box>
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
        {children}
      </Stack>
    </Stack>
  );
}

export function ProductionReportMetrics({ children }) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
      gap: 1,
      mb: 2,
    }}>
      {children}
    </Box>
  );
}

export function ProductionReportMetric({ title, value, caption, color = 'text.primary', highlighted = false }) {
  return (
    <Paper variant="outlined" sx={{ ...reportSurfaceSx, p: { xs: 1.5, sm: 2 }, ...(highlighted && { bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }) }}>
      <Typography component="div" variant="caption" color={highlighted ? color : 'text.secondary'} sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
        {title}
      </Typography>
      <Typography variant="h5" color={color} sx={{ mt: 0.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">{caption}</Typography>
    </Paper>
  );
}
