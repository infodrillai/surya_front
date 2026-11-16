import { Alert, Box, CircularProgress, Snackbar, Typography } from '@mui/material';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import CrudPage from './components/CrudPage';
import { RESOURCES, SalesOrderQtyDialogHost, ReturnDialogHost, GoodsReceiptDialogHost } from './config/resources';
import { MENU, ADMIN_MENU, SALES_MENU } from './config/menu';
import { prepareCache, syncMasters } from './db/masterCache';
import { startRealtime, stopRealtime } from './db/realtime';
import BatchPage from './pages/BatchPage';
import BeltBatchPage from './pages/BeltBatchPage';
import BeltProductionReportPage from './pages/BeltProductionReportPage';
import CustomerOutstandingPage from './pages/CustomerOutstandingPage';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import Login from './pages/Login';
import MonthlyProductionReportPage from './pages/MonthlyProductionReportPage';
import PendingOrderAnalysisPage from './pages/PendingOrderAnalysisPage';
import PendingDispatchAnalysisPage from './pages/PendingDispatchAnalysisPage';
import PriceAnalysisPage from './pages/PriceAnalysisPage';
import SalesDashboard from './pages/SalesDashboard';
import UserManagementPage from './pages/UserManagementPage';
import SalesReportsPage from './pages/SalesReportsPage';
import MyProfilePage from './pages/MyProfilePage';
import { useAuthStore } from './stores/authStore';
import { useSyncStore } from './stores/syncStore';
import { useUiStore } from './stores/uiStore';

const ROLES_BY_PATH = Object.fromEntries(
  [...ADMIN_MENU, ...SALES_MENU].flatMap((g) => g.items.map((i) => [i.path, i.roles]))
);

function Guard({ path, children }) {
  const { isAdmin } = useAuthStore.getState();
  // Admin-only paths
  const adminOnlyPaths = [
    '/user-management',
    '/sales-person',
    '/batch',
    '/belt-batch',
    
    '/belt-production-report',
    '/pending-order-analysis',
    '/purchase',
    '/goods-receipt',
    '/inventory',
    '/cnc-machine',
    '/shortage-claim',
    '/uom',
    '/category',
    '/process',
    '/vendor',
    '/charge',
    '/quotation-currency',
    '/competitor-company',
    '/product-code-mapping',
  ];
  if (adminOnlyPaths.includes(path) && !isAdmin) return <Navigate to="/" replace />;
  if (ROLES_BY_PATH[path] && !useAuthStore.getState().hasRole(ROLES_BY_PATH[path])) return <Navigate to="/" replace />;
  return children;
}

function Loading({ text }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Box sx={{ textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }} color="text.secondary">{text}</Typography></Box>
    </Box>
  );
}

function Shell() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isSalesPerson = useAuthStore((s) => s.isSalesPerson);
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
      <Routes>
        <Route path="/" element={isSalesPerson && !isAdmin ? <SalesDashboard /> : <Dashboard />} />
        <Route path="/user-management" element={<Guard path="/user-management"><UserManagementPage /></Guard>} />
        <Route path="/sales-reports" element={<SalesReportsPage />} />
        <Route path="/my-profile" element={<MyProfilePage />} />
        {Object.entries(RESOURCES).map(([path, config]) => (
          <Route key={path} path={path} element={<Guard path={path}><CrudPage key={path} config={config} /></Guard>} />
        ))}
        <Route path="/inventory" element={<Guard path="/inventory"><InventoryPage /></Guard>} />
        <Route path="/batch" element={<Guard path="/batch"><BatchPage /></Guard>} />
        <Route path="/belt-batch" element={<Guard path="/belt-batch"><BeltBatchPage /></Guard>} />
        <Route path="/belt-production-report" element={<Guard path="/belt-production-report"><BeltProductionReportPage /></Guard>} />
        <Route path="/customer-outstanding" element={<Guard path="/customer-outstanding"><CustomerOutstandingPage /></Guard>} />
        <Route path="/pending-order-analysis" element={<Guard path="/pending-order-analysis"><PendingOrderAnalysisPage /></Guard>} />
        <Route path="/pending-dispatch-analysis" element={<PendingDispatchAnalysisPage />} />
        <Route path="/price-analysis" element={<PriceAnalysisPage />} />
        <Route path="/monthly-production-report" element={<Guard path="/monthly-production-report"><MonthlyProductionReportPage /></Guard>} />
       
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}


export default function App() {
  const { status, bootstrap } = useAuthStore();
  const { toast, clearToast } = useUiStore();
  useEffect(() => { bootstrap(); }, [bootstrap]);

  return (
    <>
      {status === 'loading' ? <Loading text="Starting…" /> : status === 'anon' ? <Login /> : <Shell />}
      <SalesOrderQtyDialogHost />
      <ReturnDialogHost />
      <GoodsReceiptDialogHost />
      <Snackbar key={toast?.key} open={!!toast} autoHideDuration={4500} onClose={clearToast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={clearToast} sx={{ whiteSpace: 'pre-line' }}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
