import { Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { palette } from '../../theme';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(usr, pwd); } catch (err) { setError(err.message || 'Sign in failed'); } finally { setBusy(false); }
  };

  const fillQuick = (u, p) => {
    setUsr(u);
    setPwd(p);
    setError('');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: palette.ink, p: 2 }}>
      <Paper component="form" onSubmit={submit} sx={{ p: 4, width: 420, maxWidth: '100%' }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>CLS Surya</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5, fontSize: 14 }}>Sign in to manage production and sales.</Typography>

        {/* <Stack spacing={1.5} sx={{ mb: 2.5, bgcolor: '#f4f6f8', p: 1.5, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Quick Sign In Options:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label="Admin (Administrator)"
              size="small"
              color={usr === 'Administrator' ? 'primary' : 'default'}
              variant={usr === 'Administrator' ? 'filled' : 'outlined'}
              onClick={() => fillQuick('Administrator', 'admin')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Sales Person (sales@surya.com)"
              size="small"
              color={usr === 'sales@surya.com' || usr === 'sales' ? 'success' : 'default'}
              variant={usr === 'sales@surya.com' || usr === 'sales' ? 'filled' : 'outlined'}
              onClick={() => fillQuick('sales@surya.com', 'admin123')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Sales Person (ram@gmail.com)"
              size="small"
              color={usr === 'ram@gmail.com' ? 'success' : 'default'}
              variant={usr === 'ram@gmail.com' ? 'filled' : 'outlined'}
              onClick={() => fillQuick('ram@gmail.com', 'admin123')}
              sx={{ cursor: 'pointer' }}
            />
          </Stack>
        </Stack> */}

        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Email or username"
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="e.g. sales@surya.com"
          />
          <TextField
            label="Password"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoComplete="current-password"
          />
          <Button type="submit" variant="contained" size="large" disabled={busy || !usr || !pwd}>
            {busy ? 'Signing in...' : 'Sign in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
