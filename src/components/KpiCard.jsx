import { Box, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { palette } from '../theme';

export default function KpiCard({ label, value, note, icon: Icon, color = palette.teal }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1.5, boxShadow: '0 2px 8px rgb(20 36 58 / 4%)' }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</Typography>
        {note && <Box sx={{ mt: 0.75, typography: 'caption', color: 'text.secondary' }}>{note}</Box>}
      </Box>
      <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: 1, bgcolor: alpha(color, 0.1), color, display: 'grid', placeItems: 'center' }}>
        <Icon fontSize="small" aria-hidden="true" />
      </Box>
    </Paper>
  );
}
