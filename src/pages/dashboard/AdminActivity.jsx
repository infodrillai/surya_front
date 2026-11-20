import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, getList } from '../../api/client';
import { fmtDate, fmtNum } from '../../lib/format';

const activitySources = {
  Purchase: [['Purchase Entry', 'posting_date', 'vendor', 'status', '/purchase']],
  Production: [
    ['Stage 1 Batch', 'posting_date', 'product', 'is_completed', '/batch'],
    ['Stage 2 Batch', 'posting_date', 'product', 'is_completed', '/batch'],
    ['Stage 3 Batch', 'posting_date', 'product', 'is_completed', '/batch'],
    ['Belt Batch', 'posting_date', 'product', 'is_completed', '/belt-batch'],
  ],
  'Sales Orders': [['Sales Order', 'order_date', 'customer', 'status', '/sales-order']],
  Quotations: [['Quotation', 'quotation_date', 'customer', 'status', '/quotation']],
  Dispatch: [['Dispatch', 'dispatch_date', 'customer', 'dispatch_status', '/dispatch']],
  Returns: [['Customer Return', 'return_date', 'customer', 'return_status', '/customer-return']],
};

async function loadActivity(category) {
  const lists = await Promise.all(activitySources[category].map(async ([doctype, dateField, subject, status, route]) => {
    const rows = await getList(doctype, {
      fields: ['name', 'modified', dateField, subject, status],
      orderBy: 'modified desc, name desc',
      filters: [['docstatus', '!=', 2]],
      limit: 5,
    });
    return rows.map((row) => ({
      id: `${doctype}:${row.name}`,
      name: row.name,
      description: row[subject],
      date: row[dateField],
      updated: row.modified,
      status: status === 'is_completed' ? (Number(row[status]) ? 'Completed' : 'Draft') : row[status],
      to: status === 'is_completed' ? route : `${route}?open=${encodeURIComponent(row.name)}`,
    }));
  }));
  return lists.flat().sort((left, right) => right.updated.localeCompare(left.updated)).slice(0, 5);
}

function AdminAlerts({ lowStock, outOfStock }) {
  const pending = useQuery({
    queryKey: ['admin-alerts', 'pending-records'],
    queryFn: () => Promise.all([
      call('frappe.client.get_count', { doctype: 'Sales Order', filters: { status: 'Pending Approval' } }, { get: true }),
      call('frappe.client.get_count', { doctype: 'Dispatch', filters: { dispatch_status: 'Pending Confirmation' } }, { get: true }),
    ]),
    staleTime: 60_000,
  });
  const items = [
    ['Finished products below low-stock limit', lowStock, '/store'],
    ['Finished products out of stock', outOfStock, '/store'],
    ['Sales orders awaiting approval', pending.data?.[0], '/sales-order'],
    ['Dispatches awaiting confirmation', pending.data?.[1], '/dispatch'],
  ];
  return (
    <Paper variant="outlined" component="section" id="admin-alerts" tabIndex={-1} aria-labelledby="admin-alerts-title" sx={{ p: 2, minWidth: 0, scrollMarginTop: 88 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Bell size={18} aria-hidden="true" />
        <Typography id="admin-alerts-title" component="h2" variant="h6">Admin alerts</Typography>
      </Stack>
      {items.map(([label, count, to]) => (
        <Button key={label} component={Link} to={to} fullWidth sx={{ justifyContent: 'space-between', textAlign: 'left', mt: 0.5, color: 'text.primary' }}>
          {label}
          <Chip component="span" size="small" label={count == null ? '—' : fmtNum(count, 0)} color={Number(count) > 0 ? 'warning' : 'default'} sx={{ ml: 1 }} />
        </Button>
      ))}
      {pending.isError && <Alert severity="warning" sx={{ mt: 1 }}>Pending record counts are unavailable.</Alert>}
    </Paper>
  );
}

export function AdminAlertsLink() {
  return (
    <Tooltip title="Admin alerts">
      <IconButton onClick={() => {
        const section = document.getElementById('admin-alerts');
        section?.focus({ preventScroll: true });
        section?.scrollIntoView({ block: 'start' });
      }} aria-label="Admin alerts" sx={{ color: 'common.white', border: '1px solid #6988a6' }}>
        <Bell size={18} />
      </IconButton>
    </Tooltip>
  );
}

export default function AdminActivity({ lowStock, outOfStock }) {
  const [category, setCategory] = useState('Purchase');
  const activity = useQuery({
    queryKey: ['admin-recent-activity', category],
    queryFn: () => loadActivity(category),
    staleTime: 60_000,
  });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 1.5 }}>
      <Paper variant="outlined" component="section" aria-labelledby="recent-activity-title" sx={{ p: 2, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Clock3 size={18} aria-hidden="true" />
          <Typography id="recent-activity-title" component="h2" variant="h6">Recent activity</Typography>
        </Stack>
        <Tabs aria-label="Recent activity category" value={category} onChange={(_, value) => setCategory(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mt: 0.75 }}>
          {Object.keys(activitySources).map((name) => <Tab key={name} label={name} value={name} />)}
        </Tabs>
        <Divider />
        {activity.isLoading && <CircularProgress size={22} aria-label="Loading recent activity" sx={{ mt: 2 }} />}
        {activity.isError && <Alert severity="error" sx={{ mt: 1 }}>Could not load recent activity.</Alert>}
        {activity.data?.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No recent records.</Typography>}
        <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none', '& li + li': { borderTop: 1, borderColor: 'divider' } }}>
          {activity.data?.map(({ id, name, description, date, status, to }) => (
            <Stack component="li" key={id} direction="row" alignItems="center" gap={1} sx={{ py: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="body2" component={Link} to={to} sx={{ color: 'primary.main', fontWeight: 700 }}>
                  {name} <ArrowUpRight size={12} aria-hidden="true" />
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {[description, fmtDate(date)].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {status && <Chip label={status} size="small" variant="outlined" />}
            </Stack>
          ))}
        </Stack>
      </Paper>
      <AdminAlerts lowStock={lowStock} outOfStock={outOfStock} />
    </Box>
  );
}
