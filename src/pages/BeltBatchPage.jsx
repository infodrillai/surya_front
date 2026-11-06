import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import { BELT_STAGE_CONFIGS } from '../config/beltBatchResource';

const LABELS = [
  'Stage 1 (Roll Creation)',
  'Stage 2 (Roll Sizing)',
  'Stage 3 (Roll Finished)',
  'Stage 4 (Charges)',
];

export default function BeltBatchPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="h5">Belt production batches</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Each stage consumes the stock the previous stage produced.
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        {LABELS.map((l) => (
          <Tab key={l} label={l} />
        ))}
      </Tabs>
      <CrudPage key={tab} config={BELT_STAGE_CONFIGS[tab]} embedded />
    </Box>
  );
}
