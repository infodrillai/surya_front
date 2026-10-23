import React from 'react';
import { Alert, Button, Chip, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PostAddIcon from '@mui/icons-material/PostAdd';
import { call, runAction } from '../api/client';

/** Opens a quotation through the same ?open= convention the list page already uses. */
export const openQuotation = (name) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('open', name);
  window.location.assign(url.toString());
};

export default function QuotationVersionBar({ doc }) {
  const name = doc?.name;
  const [nav, setNav] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    setNav(null);
    if (!name) return undefined;
    call('clssurya.api.get_quotation_navigation', { name })
      .then((r) => alive && setNav(r))
      .catch(() => alive && setNav(null));
    return () => { alive = false; };
  }, [name, doc?.status, doc?.modified]);

  if (!name) return null;

  const status = nav?.current?.status || doc?.status;
  const canRevise = !!nav && !nav.next && !['Superseded', 'Accepted'].includes(status);

  const revise = async () => {
    if (!window.confirm(`Create a new version from ${name}? This quotation will become Superseded.`)) return;
    setBusy(true);
    setError('');
    try {
      const resp = await runAction('Quotation', name, 'revise');
      if (resp?.result) openQuotation(resp.result);
    } catch (e) {
      setError(e?.message || 'Could not revise this quotation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1} sx={{ mb: 0.5 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
        <Chip size="small" color="info" variant="outlined" label={`Version ${nav?.current?.version || doc?.version || 1}`} />
        <Button size="small" variant="outlined" startIcon={<ArrowBackIcon />}
          disabled={!nav?.previous} onClick={() => openQuotation(nav.previous)}>
          Previous Quotation
        </Button>
        <Button size="small" variant="outlined" endIcon={<ArrowForwardIcon />}
          disabled={!nav?.next} onClick={() => openQuotation(nav.next)}>
          Next Quotation
        </Button>
        {canRevise && (
          <Button size="small" variant="contained" startIcon={<PostAddIcon />} disabled={busy} onClick={revise}>
            Revise Quotation
          </Button>
        )}
      </Stack>
      {nav?.family?.length > 1 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {nav.family.map((q) => (
            <Chip key={q.name} size="small" clickable={q.name !== name}
              color={q.name === name ? 'primary' : 'default'}
              variant={q.name === name ? 'filled' : 'outlined'}
              label={`v${q.version} · ${q.name} · ${q.status}`}
              onClick={q.name === name ? undefined : () => openQuotation(q.name)} />
          ))}
        </Stack>
      )}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    </Stack>
  );
}