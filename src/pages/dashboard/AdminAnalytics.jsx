import { useState } from 'react';
import { Alert, Box, Button, LinearProgress, MenuItem, Paper, Skeleton, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { ArrowRight, ChartNoAxesCombined, ChevronRight, Factory, ListFilter, Package, RefreshCw, ShoppingCart, Truck } from 'lucide-react';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { call, request } from '../../api/client';
import ReportChart, { groupChartRows } from '../../components/ReportChart';
import { useMasters } from '../../hooks/useMasters';
import { fmtMoney, fmtNum } from '../../lib/format';

const sections = ['Sales', 'Purchase', 'Production', 'Inventory', 'Dispatch'];
const icons = [ChartNoAxesCombined, ShoppingCart, Factory, Package, Truck];
const sectionColors = ['#1769aa', '#16734a', '#6446a1', '#0f766e', '#a34b0a'];
const presets = ['Today', 'Yesterday', 'This Week', 'This Month', 'Previous Month', 'This Year', 'Custom'];
const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const quantity = (value) => fmtNum(value, 2);
const count = (value) => fmtNum(value, 0);
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);

function datesFor(preset) {
  const parts = Object.fromEntries(businessDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const [year, month, day] = [parts.year, parts.month, parts.day].map(Number);
  const date = (m, d) => new Date(Date.UTC(year, m - 1, d)).toISOString().slice(0, 10);
  switch (preset) {
    case 'Today': return [today, today];
    case 'Yesterday': return [date(month, day - 1), date(month, day - 1)];
    case 'This Week': {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      return [date(month, day - (weekday + 6) % 7), today];
    }
    case 'Previous Month': return [date(month - 1, 1), date(month, 0)];
    case 'This Year': return [date(1, 1), today];
    default: return [date(month, 1), today];
  }
}

async function getDashboardRows(doctype, fields, filters) {
  const rows = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const { data } = await request(`/api/resource/${encodeURIComponent(doctype)}`, {
      params: {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        order_by: 'name asc',
        limit_start: String(offset),
        limit_page_length: String(limit),
      },
    });
    rows.push(...data);
    if (data.length < limit) return rows;
  }
}

function loadSection(section, from, to) {
  const period = (dateField) => [[dateField, 'between', [from, to]], ['docstatus', '!=', 2]];
  switch (section) {
    case 'Sales':
      return Promise.all([
        getDashboardRows('Sales Order', ['name', 'order_date', 'status', 'customer', 'sales_person', 'grand_total', 'quotation'], period('order_date')),
        getDashboardRows('Quotation', ['name', 'customer', 'sales_person'], period('quotation_date')),
      ]);
    case 'Purchase':
      return Promise.all([
        getDashboardRows('Purchase Entry', ['name', 'posting_date', 'vendor', 'grand_total', 'total_ordered_qty', 'total_received_qty', 'total_pending_qty', 'status'], period('posting_date')),
        getDashboardRows('Vendor', ['name'], []),
      ]);
    case 'Production':
      return call('clssurya.api.get_pu_production_report', { from_date: from, to_date: to });
    case 'Inventory':
      return getDashboardRows('Inventory', ['name', 'stage', 'product', 'stock', 'total_amount'], []);
    case 'Dispatch':
      return getDashboardRows('Dispatch', ['name', 'dispatch_date', 'dispatch_status', 'customer'], period('dispatch_date'));
    default:
      return undefined;
  }
}

function analytics(section, data, productNames) {
  const chart = (title, rows, label, value, format, chronological, donut = false) => ({
    title, points: groupChartRows(rows, label, value), format, chronological, donut,
  });
  const monthly = (field) => (row) => row[field]?.slice(0, 7);
  const productLabel = (row) => productNames.get(row.product) || row.product;
  switch (section) {
    case 'Sales': {
      const [orders, quotes] = data;
      const active = orders.filter(({ status }) => status !== 'Cancelled');
      const linked = new Set(active.map(({ quotation }) => quotation).filter(Boolean));
      return {
        metrics: [
          ['Sales order value', fmtMoney(sum(active, 'grand_total'))],
          ['Sales orders', count(active.length)],
          ['Quotations', count(quotes.length)],
          ['Quotations linked to period orders', count(quotes.filter(({ name }) => linked.has(name)).length)],
          ['Orders pending approval', count(active.filter(({ status }) => status === 'Pending Approval').length)],
          ['Completed orders', count(active.filter(({ status }) => status === 'Completed').length)],
        ],
        charts: [
          chart('Monthly sales order value', active, monthly('order_date'), (r) => r.grand_total, fmtMoney, true),
          chart('Sales order value by customer', active, (r) => r.customer, (r) => r.grand_total, fmtMoney),
          chart('Sales order value by salesperson', active, (r) => r.sales_person, (r) => r.grand_total, fmtMoney),
          chart('Sales order status', orders, (r) => r.status, undefined, undefined, false, true),
        ],
        links: [['/sales-reports', 'Sales Reports'], ['/sales-person-report', 'Sales Person Report']],
      };
    }
    case 'Purchase': {
      const [purchases, vendors] = data;
      const active = purchases.filter(({ status }) => !['Cancelled', 'Rejected'].includes(status));
      return {
        metrics: [
          ['Purchase entry value', fmtMoney(sum(active, 'grand_total'))],
          ['Purchase entries', count(active.length)],
          ['Ordered quantity', quantity(sum(active, 'total_ordered_qty'))],
          ['Received quantity', quantity(sum(active, 'total_received_qty'))],
          ['Pending purchase quantity', quantity(sum(active, 'total_pending_qty'))],
          ['Vendor masters', count(vendors.length)],
        ],
        charts: [
          chart('Monthly purchase entry value', active, monthly('posting_date'), (r) => r.grand_total, fmtMoney, true),
          chart('Purchase entry value by vendor', active, (r) => r.vendor, (r) => r.grand_total, fmtMoney),
        ],
        links: [['/pending-order-analysis', 'Pending Order Report'], ['/price-analysis', 'Price Analysis Report']],
      };
    }
    case 'Production': {
      const completed = data.rows.filter((row) => row.status === 'Completed');
      const finished = completed.filter(({ stage_no }) => stage_no === 3);
      const produced = sum(completed, 'produced_qty');
      return {
        metrics: [
          ['Completed PU stage output', quantity(produced)],
          ...[1, 2, 3].map((stage) => [`PU Stage ${stage} output`, quantity(sum(completed.filter((row) => row.stage_no === stage), 'produced_qty'))]),
          ['PU Stage 3 accepted output', quantity(sum(finished, 'accepted_qty'))],
          ['Rejected quantity', quantity(sum(completed, 'rejected_qty'))],
        ],
        charts: [
          chart('Monthly PU Stage 3 accepted output', finished, monthly('posting_date'), (r) => r.accepted_qty, quantity, true),
          chart('PU output by stage', completed, (r) => `Stage ${r.stage_no}`, (r) => r.produced_qty, quantity),
          chart('PU Stage 3 accepted output by product', finished, productLabel, (r) => r.accepted_qty, quantity),
          chart('PU rejection by stage', completed, (r) => `Stage ${r.stage_no}`, (r) => r.rejected_qty, quantity),
        ],
        links: [['/monthly-production-report', 'Month Production Report'], ['/pu-production-report', 'PU Production Report'], ['/belt-production-report', 'Belt Production Report']],
      };
    }
    case 'Inventory':
      return {
        metrics: [
          ['Current inventory value', fmtMoney(sum(data, 'total_amount'))],
          ['Products with stock', count(new Set(data.filter((row) => Number(row.stock) > 0).map((row) => row.product)).size)],
          ['Stock records without quantity', count(data.filter((row) => Number(row.stock) <= 0).length)],
        ],
        charts: [
          chart('Current inventory value by stage', data, (r) => r.stage, (r) => r.total_amount, fmtMoney, false, true),
          chart('Current inventory value by product', data, productLabel, (r) => r.total_amount, fmtMoney),
        ],
        links: [['/inventory', 'Inventory'], ['/store', 'Store']],
      };
    case 'Dispatch': {
      const completed = data.filter((row) => row.dispatch_status === 'Dispatched');
      return {
        metrics: [
          ['Dispatch records', count(data.length)],
          ['Dispatched records', count(completed.length)],
          ['Pending confirmation', count(data.filter((row) => row.dispatch_status === 'Pending Confirmation').length)],
        ],
        charts: [
          chart('Monthly dispatched records', completed, monthly('dispatch_date'), undefined, undefined, true),
          chart('Dispatched records by customer', completed, (r) => r.customer),
          chart('Dispatch status', data, (r) => r.dispatch_status, undefined, undefined, false, true),
        ],
        links: [['/pending-dispatch-analysis', 'Pending Dispatch Report']],
      };
    }
    default:
      return null;
  }
}

const sectionFilters = {
  Sales: [['customer', 'Customer'], ['sales_person', 'Salesperson'], ['status', 'Order status']],
  Purchase: [['vendor', 'Vendor']],
  Production: [['product', 'Product'], ['stage_no', 'Production stage']],
  Inventory: [['product', 'Product'], ['stage', 'Stock stage']],
  Dispatch: [['customer', 'Customer'], ['dispatch_status', 'Dispatch status']],
};

function primaryRows(section, data) {
  if (section === 'Sales' || section === 'Purchase') return data[0];
  if (section === 'Production') return data.rows;
  return data;
}

function filterSection(section, data, filters) {
  const matches = (row) => Object.entries(filters).every(([key, value]) => !value || String(row[key]) === value);
  const rows = primaryRows(section, data).filter(matches);
  if (section === 'Sales') {
    const quotes = data[1].filter((quote) =>
      (!filters.customer || quote.customer === filters.customer) &&
      (!filters.sales_person || quote.sales_person === filters.sales_person));
    return [rows, quotes];
  }
  if (section === 'Purchase') return [rows, data[1]];
  if (section === 'Production') return { ...data, rows };
  return rows;
}

const workflows = [
  [ShoppingCart, sectionColors[1], 'Purchase and receiving', [
    ['/vendor', 'Vendor selection'], ['/purchase', 'Purchase entry and landed cost'],
    ['/goods-receipt', 'Goods receipt'], ['/inventory', 'Raw inventory'],
  ]],
  [Factory, sectionColors[2], 'PU manufacturing', [
    ['/product', 'Product and BOM'], ['/batch', 'Stage 1 · Insert Making'], ['/batch', 'Stage 2 · PU Casting'],
    ['/batch', 'Stage 3 · CNC'], ['/store', 'Finished goods'],
  ]],
  [Truck, sectionColors[4], 'Sales and fulfillment', [
    ['/customer', 'Customer'], ['/quotation', 'Quotation and approval'], ['/sales-order', 'Sales order and approval'],
    ['/dispatch', 'Dispatch and confirmation'], ['/customer-return', 'Returns'],
  ]],
  [Package, sectionColors[3], 'Inventory movement', [
    ['/goods-receipt', 'Purchase receipt'], ['/inventory', 'Raw and production stock'],
    ['/store', 'Finished goods'], ['/dispatch', 'Dispatch'], ['/inventory', 'Stock ledger'],
  ]],
  [ChartNoAxesCombined, sectionColors[0], 'Complete ERP overview', [
    ['/product', 'Masters'], ['/purchase', 'Purchasing'], ['/inventory', 'Inventory'], ['/batch', 'Production'],
    ['/store', 'Finished goods'], ['/sales-order', 'Sales'], ['/dispatch', 'Dispatch'], ['/customer-return', 'Returns'],
    ['/sales-reports', 'Reports'], ['/', 'Admin dashboard'],
  ]],
];

export default function AdminAnalytics() {
  const [section, setSection] = useState('Sales');
  const [filters, setFilters] = useState({});
  const [preset, setPreset] = useState('This Month');
  const [[from, to], setRange] = useState(() => datesFor('This Month'));
  const inventory = section === 'Inventory';
  const validRange = Boolean(from && to && from <= to);
  const query = useQuery({
    queryKey: ['admin-dashboard', section, inventory ? null : from, inventory ? null : to],
    queryFn: () => loadSection(section, from, to),
    enabled: inventory || validRange,
  });
  const products = useMasters('Product');
  const activeIndex = sections.indexOf(section);
  const accent = sectionColors[activeIndex];
  const filtersActive = Object.values(filters).some(Boolean);
  const productNames = new Map(products.map((item) => [item.name, item.product_name]));
  const rows = query.data ? primaryRows(section, query.data) : [];
  const result = query.data && (inventory || validRange)
    ? analytics(section, filterSection(section, query.data, filters), productNames)
    : null;

  return (
    <Stack spacing={2.5}>
      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 1.5, md: 2.5 }, pt: 2 }}>
          <Typography component="h2" variant="h6">Business Overview</Typography>
          <Tabs
            aria-label="Dashboard areas"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            value={section}
            onChange={(_, value) => { setSection(value); setFilters({}); }}
            sx={{
              mt: 1,
              '& .MuiTabs-indicator': { bgcolor: accent },
              '& .MuiTab-root': { minHeight: 48, px: { xs: 1.5, sm: 2 }, gap: 0.75, borderRadius: '8px 8px 0 0' },
              '& .MuiTab-root.Mui-selected': { color: accent, bgcolor: alpha(accent, 0.08) },
            }}
          >
            {sections.map((name, index) => {
              const Icon = icons[index];
              return <Tab key={name} value={name} label={name} icon={<Icon size={17} aria-hidden="true" />} iconPosition="start" />;
            })}
          </Tabs>
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2.5 }, bgcolor: '#f8fafc', borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.25 }}>
            <ListFilter size={16} aria-hidden="true" />
            <Typography variant="subtitle2">Filters</Typography>
            {filtersActive && <Button size="small" onClick={() => setFilters({})} sx={{ ml: 'auto' }}>Clear filters</Button>}
          </Stack>
          <Stack direction="row" useFlexGap gap={1} flexWrap="wrap" alignItems="center">
            <TextField select label="Date range" value={preset} disabled={inventory} sx={{ width: { xs: '100%', sm: 155 } }} onChange={(event) => {
              setPreset(event.target.value);
              if (event.target.value !== 'Custom') setRange(datesFor(event.target.value));
            }}>
              {presets.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            {[['From', from], ['To', to]].map(([label, value], index) => (
              <TextField key={label} label={label} type="date" value={value} disabled={inventory} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { xs: '100%', sm: 155 } }} onChange={(event) => {
                setPreset('Custom');
                setRange(index === 0 ? [event.target.value, to] : [from, event.target.value]);
              }} />
            ))}
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => query.refetch()} disabled={query.isFetching || (!inventory && !validRange)}>Refresh</Button>
          </Stack>
          <Stack direction="row" useFlexGap gap={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
            {sectionFilters[section].map(([field, label]) => {
              const values = [...new Set(rows.map((row) => String(row[field] ?? '')).filter(Boolean))];
              const display = (value) => field === 'product' ? productNames.get(value) || value : value;
              const options = [...new Set([...values, filters[field]].filter(Boolean))].sort((a, b) => display(a).localeCompare(display(b)));
              return <TextField key={field} select label={label} value={filters[field] || ''} sx={{ width: { xs: '100%', sm: 195 } }} onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}>
                <MenuItem value="">All</MenuItem>
                {options.map((value) => <MenuItem key={value} value={value}>{display(value)}</MenuItem>)}
              </TextField>;
            })}
          </Stack>
        </Box>
      </Paper>
      {inventory && <Typography variant="body2" color="text.secondary">Current inventory snapshot. Date filters apply to transactions.</Typography>}
      {section === 'Production' && <Typography variant="body2" color="text.secondary">PU stage totals count output at each step. Use the Belt Production Report for belt quantities, roll usage and costs.</Typography>}
      {!inventory && !validRange && <Alert severity="warning">Enter a date range with the start on or before the end.</Alert>}
      {query.isFetching && <LinearProgress aria-label="Loading dashboard data" sx={{ borderRadius: 2 }} />}
      {query.isLoading && <Box aria-hidden="true" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
        {[0, 1, 2].map((index) => <Skeleton key={index} variant="rounded" height={82} />)}
      </Box>}
      {query.isError && <Alert severity="error">{query.error?.message || 'Could not load dashboard data.'}</Alert>}
      {result && <>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 175px), 1fr))' }}>
          {result.metrics.map(([label, value]) => (
            <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 0, borderRadius: 2, borderLeft: `3px solid ${accent}`, boxShadow: '0 2px 8px rgb(20 36 58 / 5%)' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
              <Typography variant="h5" sx={{ mt: 0.5, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            </Paper>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {result.charts.map((item) => <ReportChart key={item.title} accent={accent} {...item} />)}
        </Box>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          {result.links.map(([to, label]) => <Button key={to} component={Link} to={to} variant="outlined" size="small" endIcon={<ArrowRight size={15} />}>{label}</Button>)}
        </Stack>
      </>}
      <Box component="section" aria-labelledby="erp-workflows">
        <Typography id="erp-workflows" component="h2" variant="h6" sx={{ mb: 1.25 }}>ERP Workflow Overview</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {workflows.map(([Icon, color, title, steps]) => (
              <Paper key={title} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1.25 }}>
                  <Box sx={{ display: 'grid', placeItems: 'center', width: 34, height: 34, bgcolor: alpha(color, 0.1), color, borderRadius: 1 }}>
                    <Icon size={17} aria-hidden="true" />
                  </Box>
                  <Typography component="h3" variant="subtitle2">{title}</Typography>
                </Stack>
                <Stack component="ol" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {steps.map(([to, label], step) => (
                    <Box component="li" key={label}>
                      <Button component={Link} to={to} fullWidth endIcon={<ChevronRight size={15} />} sx={{
                        justifyContent: 'flex-start', gap: 0.75, textAlign: 'left', color: 'text.primary',
                        bgcolor: '#f6f8fb', '& .MuiButton-endIcon': { ml: 'auto' },
                      }}>
                        <Box component="span" sx={{ color, fontVariantNumeric: 'tabular-nums' }}>{step + 1}.</Box>
                        {label}
                      </Button>
                    </Box>
                  ))}
                </Stack>
              </Paper>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
