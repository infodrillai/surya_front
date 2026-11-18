import { Alert, Box, CircularProgress, Snackbar, Typography } from '@mui/material';
import { useEffect } from 'react';
import Layout from './components/Layout';
import { SalesOrderQtyDialogHost, ReturnDialogHost, GoodsReceiptDialogHost } from './config/resources';
import { prepareCache, syncMasters } from './db/masterCache';
import { startRealtime, stopRealtime } from './db/realtime';
import { Login } from './pages';
import { AppRoutes } from './routes';
import { useAuthStore } from './stores/authStore';
import { useSyncStore } from './stores/syncStore';
import { useUiStore } from './stores/uiStore';

function Loading({ text }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Box sx={{ textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }} color="text.secondary">{text}</Typography></Box>
    </Box>
  );
}

function Shell() {
  const user = useAuthStore((s) => s.user);
  const status = useSyncStore((s) => s.status);

  useEffect(() => {
    let live = true;
    (async () => {
      await prepareCache(user); // different user or schema bump -> wipe IndexedDB
      if (!live) return;
      await syncMasters();
      startRealtime();
    })();
    return () => { live = false; stopRealtime(); };
  }, [user]);

  if (status === 'idle' || (status === 'syncing' && !Object.keys(useSyncStore.getState().versions).length)) return <Loading text="Loading master data…" />;

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}


export default function App() {
  const { status, user, bootstrap } = useAuthStore();
  const { toast, clearToast } = useUiStore();
  useEffect(() => { bootstrap(); }, [bootstrap]);

  const isAuthed = status === 'authed' && user && user !== 'Guest';

  return (
    <>
      {status === 'loading' ? <Loading text="Starting…" /> : !isAuthed ? <Login /> : <Shell />}
      <SalesOrderQtyDialogHost />
      <ReturnDialogHost />
      <GoodsReceiptDialogHost />
      <Snackbar key={toast?.key} open={!!toast} autoHideDuration={4500} onClose={clearToast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={clearToast} sx={{ whiteSpace: 'pre-line' }}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
