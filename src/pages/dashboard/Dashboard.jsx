import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { Inventory2Outlined, PaymentsOutlined, PendingActionsOutlined, WarningAmberOutlined } from '@mui/icons-material';
import { ArrowUpRight, CalendarDays, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import KpiCard from '../../components/KpiCard';
import SuryaBrandMark, { companyName } from '../../components/SuryaBrandMark';
import AdminAnalytics from './AdminAnalytics';
import AdminActivity, { AdminAlertsLink } from './AdminActivity';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { getList } from '../../api/client';
import { db } from '../../db/dexie';
import { useFinishedCost } from '../../hooks/useFinishedCost';
import { fmtMoney, fmtNum } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';

export default function Dashboard() {
  const { fullName, isAdmin, hasRole } = useAuthStore();
  const products = useLiveQuery(() => db.Product.toArray(), []);
  const stockLimits = useMemo(() => {
    const limits = new Map();
    for (const product of products ?? []) {
      if (!limits.has(product.name)) limits.set(product.name, product.low_stock_limit);
    }
    return limits;
  }, [products]);
  const finishedCost = useFinishedCost();
  const finished = finishedCost.data || {};
  const pending = useQuery({ queryKey: ['list', 'Sales Order'], queryFn: () => getList('Sales Order'), enabled: isAdmin || hasRole(['CS Sales']) });
  const finishedRows = Object.entries(finished);
  const value = finishedRows.reduce((s, [, r]) => s + r.stock * r.unit_price, 0);
  const low = finishedRows.filter(([code, r]) => r.stock < (stockLimits.get(code) || 0));
  const waiting = (pending.data || []).filter((o) => o.status === 'Pending Approval').length;

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      <Box sx={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        p: { xs: 2.5, sm: 3.5, lg: 4 },
        borderRadius: 3,
        color: 'common.white',
        bgcolor: '#14243a',
        backgroundImage: 'linear-gradient(112deg, #14243a 18%, #1d4569 100%)',
        '&::after': {
          content: '""', position: 'absolute', inset: 0, zIndex: -1,
          backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 16%) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          maskImage: 'linear-gradient(90deg, transparent 60%, black)',
        },
      }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} spacing={2.5}>
          <Box sx={{ minWidth: 0 }}>
            {isAdmin && <Stack direction="row" gap={1.25} alignItems="center" sx={{ mb: 1.25, color: '#d6e6f5' }}>
              <SuryaBrandMark />
              <Typography variant="subtitle2">{companyName}</Typography>
            </Stack>}
            <Typography component="h1" sx={{ fontSize: { xs: '1.65rem', sm: '2.25rem' }, lineHeight: 1.18, fontWeight: 750, letterSpacing: '-0.035em', overflowWrap: 'anywhere' }}>
              Welcome, {fullName}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 1.25, color: '#d6e6f5' }}>
              {isAdmin && <CalendarDays size={16} aria-hidden="true" />}
              <Typography variant="body2">
                {isAdmin ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(new Date()) : 'Here is where stock and orders stand today.'}
              </Typography>
            </Stack>
          </Box>
          {isAdmin && <Stack direction="row" useFlexGap gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
            <Button component={Link} to="/sales-reports" variant="contained" endIcon={<ArrowUpRight size={16} />} sx={{ bgcolor: 'common.white', color: '#173451', '&:hover': { bgcolor: '#e6f0fa' } }}>Sales Reports</Button>
            <Button component={Link} to="/my-profile" variant="outlined" startIcon={<UserRound size={16} />} sx={{ color: 'common.white', borderColor: '#6988a6', '&:hover': { borderColor: '#d6e6f5', bgcolor: 'rgb(255 255 255 / 8%)' } }}>My Profile</Button>
            <AdminAlertsLink />
          </Stack>}
        </Stack>
      </Box>
      <Box component="section" aria-labelledby="current-snapshot">
        <Typography id="current-snapshot" component="h2" variant="subtitle1" sx={{ mb: 1.25, fontWeight: 750 }}>Current snapshot</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
          <KpiCard icon={Inventory2Outlined} label="Products" value={products ? fmtNum(products.length, 0) : '—'} />
          <KpiCard icon={PaymentsOutlined} label="Finished stock value" value={finishedCost.data ? fmtMoney(value) : '—'} />
          <KpiCard icon={WarningAmberOutlined} color="#a34b0a" label="Finished below low limit" value={products && finishedCost.data ? fmtNum(low.length, 0) : '—'} note={low.length > 0 && <Chip size="small" color="warning" label="Needs production" sx={{ mt: 1 }} />} />
          <KpiCard icon={PendingActionsOutlined} label="Orders awaiting approval" value={pending.data ? fmtNum(waiting, 0) : '—'} />
        </Box>
      </Box>
      {isAdmin && <>
        <AdminAnalytics />
        <AdminActivity
          lowStock={products && finishedCost.data ? low.length : null}
          outOfStock={products && finishedCost.data ? products.filter((product) =>
            product.product_type === 'Finished' && Number(finished[product.name]?.stock ?? 0) === 0).length : null}
        />
      </>}
    </Stack>
  );
}
