import { Box } from '@mui/material';
import { Sun } from 'lucide-react';

export const companyName = 'Surya CLS Pvt Ltd';

export default function SuryaBrandMark({ size = 36 }) {
  return (
    <Box component="span" aria-hidden="true" sx={{
      display: 'inline-grid', placeItems: 'center', width: size, height: size, flexShrink: 0,
      borderRadius: 1.25, color: '#ffd680', bgcolor: '#183652', border: '1px solid #43627e',
    }}>
      <Sun size={Math.round(size * 0.57)} strokeWidth={1.8} />
    </Box>
  );
}
