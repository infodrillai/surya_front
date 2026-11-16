import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccessTimeOutlined,
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  FilterListRounded,
  HandshakeOutlined,
  Inventory2Outlined,
  LocalShippingOutlined,
  PendingActionsOutlined,
  ReceiptLongOutlined,
  RefreshRounded,
  RestartAltRounded,
  SearchRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { call } from '../api/client';
import { fmtDate, fmtNum } from '../lib/format';
import { palette } from '../theme';

function StatCard({ label, value, subtitle, icon: Icon, iconBg, iconColor }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.2,
        borderRadius: '12px',
        bgcolor: '#ffffff',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 20px -6px rgba(14, 42, 47, 0.08)',
        },
      }}
    >
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: '#0f172a' }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          p: 1.25,
          borderRadius: '10px',
          bgcolor: iconBg || 'rgba(14, 42, 47, 0.06)',
          color: iconColor || palette.teal,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 24 }} />
      </Box>
    </Paper>
  );
}

function StatusChip({ status, pendingQty, orderedQty }) {
  let color = 'default';
  let variant = 'outlined';
  let label = status || 'Draft';

  const s = String(status || '').toLowerCase();
  if (s.includes('cancel') || s.includes('reject')) {
    color = 'error';
    label = status;
  } else if (pendingQty <= 0.00001 && orderedQty > 0) {
    color = 'success';
    variant = 'filled';
    label = 'Fully Dispatched';
  } else if (s.includes('partially') || (pendingQty < orderedQty && pendingQty > 0)) {
    color = 'warning';
    variant = 'filled';
    label = 'Partially Dispatched';
  } else if (s.includes('approved')) {
    color = 'primary';
    variant = 'filled';
    label = 'Approved';
  } else if (s.includes('pending')) {
    color = 'info';
    variant = 'outlined';
    label = 'Pending Approval';
  }

  return (
    <Chip
      size="small"
      label={label}
      color={color}
      variant={variant}
      sx={{
        fontWeight: 600,
        fontSize: '0.72rem',
        height: 22,
        borderRadius: '6px',
      }}
    />
  );
}

export default function PendingDispatchAnalysisPage() {
  const navigate = useNavigate();

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [soFilter, setSoFilter] = useState('');
  const [productNameFilter, setProductNameFilter] = useState('');
  const [productCodeFilter, setProductCodeFilter] = useState('ALL');
  const [productionCodeFilter, setProductionCodeFilter] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch report data
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'pendingDispatchAnalysis',
      fromDate,
      toDate,
      customerFilter,
      soFilter,
      productNameFilter,
      productCodeFilter,
      productionCodeFilter,
      salesPersonFilter,
      orderStatusFilter,
      includeCompleted,
    ],
    queryFn: async () => {
      const res = await call('clssurya.api.get_pending_dispatch_analysis', {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        customer: customerFilter !== 'ALL' ? customerFilter : undefined,
        sales_order: soFilter || undefined,
        product: productNameFilter || undefined,
        product_code: productCodeFilter !== 'ALL' ? productCodeFilter : undefined,
        production_code: productionCodeFilter || undefined,
        sales_person: salesPersonFilter !== 'ALL' ? salesPersonFilter : undefined,
        order_status: orderStatusFilter !== 'ALL' ? orderStatusFilter : undefined,
        include_completed: includeCompleted ? 1 : 0,
      });
      return res || { rows: [], summary: {}, customers: [], products: [], sales_persons: [], order_statuses: [] };
    },
    staleTime: 30 * 1000,
  });

  const rawRows = data?.rows || [];
  const customerOptions = data?.customers || [{ value: 'ALL', label: 'All Customers' }];
  const productOptions = data?.products || [{ value: 'ALL', label: 'All Products' }];
  const salesPersonOptions = data?.sales_persons || [{ value: 'ALL', label: 'All Sales Persons' }];
  const orderStatusOptions = data?.order_statuses || [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Partially Dispatched', label: 'Partially Dispatched' },
    { value: 'Completed', label: 'Completed' },
  ];

  // Client-side quick search filtering
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rawRows;
    const q = searchQuery.toLowerCase().trim();
    return rawRows.filter((r) =>
      (r.sales_order_id || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.product_code || '').toLowerCase().includes(q) ||
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.production_code || '').toLowerCase().includes(q) ||
      (r.order_status || '').toLowerCase().includes(q) ||
      (r.sales_person || '').toLowerCase().includes(q)
    );
  }, [rawRows, searchQuery]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  // Dynamic summary of visible filtered rows
  const summary = useMemo(() => {
    let totOrdered = 0;
    let totDispatched = 0;
    let totPending = 0;
    let totPendingAmt = 0;
    const pendingOrders = new Set();

    filteredRows.forEach((r) => {
      const ord = Number(r.ordered_qty) || 0;
      const dsp = Number(r.dispatched_qty) || 0;
      const pnd = Number(r.pending_qty) || 0;
      const amt = Number(r.pending_amount) || 0;

      totOrdered += ord;
      totDispatched += dsp;
      totPending += pnd;
      totPendingAmt += amt;
      if (pnd > 0.000001) {
        pendingOrders.add(r.sales_order_id);
      }
    });

    return {
      total_pending_orders: pendingOrders.size,
      total_ordered_qty: totOrdered,
      total_dispatched_qty: totDispatched,
      total_pending_dispatch_qty: totPending,
      total_pending_amount: totPendingAmt,
      count: filteredRows.length,
    };
  }, [filteredRows]);

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setCustomerFilter('ALL');
    setSoFilter('');
    setProductNameFilter('');
    setProductCodeFilter('ALL');
    setProductionCodeFilter('');
    setSalesPersonFilter('ALL');
    setOrderStatusFilter('ALL');
    setIncludeCompleted(false);
    setSearchQuery('');
    setPage(0);
  };

  // Export to CSV / Excel
  const exportCsv = () => {
    if (!filteredRows.length) return;
    const headers = [
      'Sales Order Date',
      'Sales Order No',
      'Customer Name',
      'Product ',
      'Product Code',
      'Order Qty',
      'Dispatch Qty',
      'Pending Qty',
      'Unit',
      'Rate (INR)',
      'Order Amount (INR)',
      'Dispatch Amount (INR)',
      'Pending Amount (INR)',
      'Sales Order Status',
      'Expected Delivery Date',
    ];

    const csvRows = filteredRows.map((r) => [
      `"${r.sales_order_date || ''}"`,
      `"${r.sales_order_id || ''}"`,
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      `"${(r.product_name || '').replace(/"/g, '""')}"`,
      `"${r.product_code || ''}"`,
      `"${r.production_code || ''}"`,
      r.ordered_qty ?? 0,
      r.dispatched_qty ?? 0,
      r.pending_qty ?? 0,
      `"${r.uom || ''}"`,
      r.rate ?? 0,
      r.total_order_amount ?? 0,
      r.dispatched_amount ?? 0,
      r.pending_amount ?? 0,
      `"${r.order_status || ''}"`,
      `"${r.expected_delivery_date || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Pending_Dispatch_Analysis_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Page Title & Actions */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
            Pending Dispatch Analysis
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Monitor approved sales orders and track unfulfilled dispatch quantities and pending order values.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={
              <RefreshRounded
                sx={{
                  animation: isFetching ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                }}
              />
            }
            onClick={() => refetch()}
            disabled={isFetching}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadRounded />}
            onClick={exportCsv}
            disabled={!filteredRows.length}
            sx={{
              bgcolor: palette.teal,
              '&:hover': { bgcolor: '#0b2327' },
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: 'none',
            }}
          >
            Export Excel (CSV)
          </Button>
        </Stack>
      </Stack>

      {/* Filter Section */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '12px', mb: 3, bgcolor: '#ffffff' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <FilterListRounded sx={{ color: palette.teal, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Report Filters
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            size="small"
            startIcon={<RestartAltRounded />}
            onClick={handleResetFilters}
            sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'text.secondary' }}
          >
            Reset All
          </Button>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(5, 1fr)',
            },
            gap: 2,
          }}
        >
          {/* 1. From Date */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              From Date
            </Typography>
            <TextField
              type="date"
              size="small"
              fullWidth
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 2. To Date */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              To Date
            </Typography>
            <TextField
              type="date"
              size="small"
              fullWidth
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 3. Customer */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Customer
            </Typography>
            <Select
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(0);
              }}
              displayEmpty
              sx={{ borderRadius: '8px' }}
            >
              {customerOptions.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

         

          {/* 5. Product Name */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Product Name
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Search product name..."
              value={productNameFilter}
              onChange={(e) => {
                setProductNameFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 6. Product Code */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Product Code
            </Typography>
            <Select
              value={productCodeFilter}
              onChange={(e) => {
                setProductCodeFilter(e.target.value);
                setPage(0);
              }}
              displayEmpty
              sx={{ borderRadius: '8px' }}
            >
              {productOptions.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>


          {/* 8. Sales Person */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Sales Person
            </Typography>
            <Select
              value={salesPersonFilter}
              onChange={(e) => {
                setSalesPersonFilter(e.target.value);
                setPage(0);
              }}
              displayEmpty
              sx={{ borderRadius: '8px' }}
            >
              {salesPersonOptions.map((sp) => (
                <MenuItem key={sp.value} value={sp.value}>
                  {sp.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 9. Order Status */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Order Status
            </Typography>
            <Select
              value={orderStatusFilter}
              onChange={(e) => {
                setOrderStatusFilter(e.target.value);
                setPage(0);
              }}
              displayEmpty
              sx={{ borderRadius: '8px' }}
            >
              {orderStatusOptions.map((os) => (
                <MenuItem key={os.value} value={os.value}>
                  {os.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Quick Search */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Quick Table Search
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Search table rows..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery('')}>
                        <CloseRounded fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <FormControlLabel
            control={
              <Switch
                checked={includeCompleted}
                onChange={(e) => {
                  setIncludeCompleted(e.target.checked);
                  setPage(0);
                }}
                color="primary"
                size="small"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#334155' }}>
                Include Completed / Fully Dispatched Orders (Pending = 0)
              </Typography>
            }
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Showing <b>{filteredRows.length}</b> line item(s)
          </Typography>
        </Stack>
      </Paper>

      {/* Summary KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Total Pending Orders"
          value={summary.total_pending_orders}
          subtitle="Orders awaiting dispatch"
          icon={PendingActionsOutlined}
          iconBg="rgba(245, 158, 11, 0.1)"
          iconColor="#d97706"
        />
        <StatCard
          label="Total Ordered Qty"
          value={fmtNum(summary.total_ordered_qty, 2)}
          subtitle={`${summary.count} line items`}
          icon={ReceiptLongOutlined}
          iconBg="rgba(59, 130, 246, 0.1)"
          iconColor="#2563eb"
        />
        <StatCard
          label="Total Dispatched Qty"
          value={fmtNum(summary.total_dispatched_qty, 2)}
          subtitle="Confirmed dispatches"
          icon={CheckCircleOutlineRounded}
          iconBg="rgba(16, 185, 129, 0.1)"
          iconColor="#059669"
        />
        <StatCard
          label="Pending Dispatch Qty"
          value={fmtNum(summary.total_pending_dispatch_qty, 2)}
          subtitle="Balance to dispatch"
          icon={Inventory2Outlined}
          iconBg="rgba(234, 88, 12, 0.1)"
          iconColor="#ea580c"
        />
        <StatCard
          label="Total Pending Amount"
          value={`₹${fmtNum(summary.total_pending_amount, 2)}`}
          subtitle="Value of pending items"
          icon={LocalShippingOutlined}
          iconBg="rgba(14, 42, 47, 0.1)"
          iconColor={palette.teal}
        />
      </Box>

      {/* Table Section */}
      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow
                sx={{
                  '& th': {
                    bgcolor: '#f8fafc',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    py: 1.25,
                    px: 1,
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <TableCell width={45} align="center">#</TableCell>
                <TableCell>Order Dt</TableCell>
                <TableCell>Order No</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell align="center">Product </TableCell>
                <TableCell align="right">Order Qty</TableCell>
                <TableCell align="right">Dispatch Qty</TableCell>
                <TableCell align="right">Pending Qty</TableCell>
              
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Order Amt</TableCell>
                <TableCell align="right">Dis. Amt</TableCell>
                <TableCell align="right">Pen. Amt</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell>Exp. Del Dt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 17 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={17} align="center" sx={{ py: 6 }}>
                    <Typography color="error" variant="body2">
                      Failed to load Pending Dispatch Analysis: {error?.message || 'Unknown error'}
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => refetch()} sx={{ mt: 1.5, borderRadius: '6px' }}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} align="center" sx={{ py: 8 }}>
                    <Box sx={{ color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineRounded sx={{ fontSize: 44, color: '#94a3b8' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#334155' }}>
                        No Pending Dispatches Found
                      </Typography>
                      <Typography variant="body2" sx={{ maxWidth: 480, color: 'text.secondary' }}>
                        {includeCompleted
                          ? 'No sales orders match the specified filter criteria.'
                          : 'All approved sales orders are fully dispatched. Enable "Include Completed" above to view fulfilled orders.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isFullyPending = row.dispatched_qty <= 0.00001;
                  const isFullyDispatched = row.pending_qty <= 0.00001;
                  const isPartiallyDispatched = !isFullyPending && !isFullyDispatched;

                  return (
                    <TableRow
                      key={`${row.sales_order_id}-${row.product_code}-${idx}`}
                      hover
                      sx={{
                        bgcolor: isFullyDispatched ? 'rgba(240, 253, 244, 0.4)' : 'inherit',
                        '&:hover': { bgcolor: isFullyDispatched ? 'rgba(240, 253, 244, 0.8) !important' : undefined },
                      }}
                    >
                      <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.78rem', px: 1 }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', px: 1 }}>
                        {fmtDate(row.sales_order_date)}
                      </TableCell>
                      <TableCell sx={{ px: 1 }}>
                        <Button
                          size="small"
                          onClick={() => navigate('/sales-order')}
                          sx={{
                            fontWeight: 700,
                            color: palette.teal,
                            p: 0,
                            minWidth: 'auto',
                            textTransform: 'none',
                            fontSize: '0.82rem',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {row.sales_order_id}
                        </Button>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500, fontSize: '0.82rem', px: 1 }}>
                        {row.customer_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.82rem', px: 1, minWidth: 160 }}>
                        {row.product_name}
                      </TableCell>
                      
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem', px: 1 }}>
                        {fmtNum(row.ordered_qty, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#059669', fontWeight: 600, fontSize: '0.82rem', px: 1 }}>
                        {fmtNum(row.dispatched_qty, 2)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          px: 1,
                          color: isFullyDispatched ? '#059669' : isPartiallyDispatched ? '#d97706' : '#ea580c',
                        }}
                      >
                        {fmtNum(row.pending_qty, 2)}
                      </TableCell>
                      
                      <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1 }}>
                        ₹{fmtNum(row.rate, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, fontWeight: 500 }}>
                        ₹{fmtNum(row.total_order_amount, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, color: '#059669' }}>
                        ₹{fmtNum(row.dispatched_amount, 2)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          px: 1,
                          color: isFullyDispatched ? '#059669' : '#ea580c',
                        }}
                      >
                        ₹{fmtNum(row.pending_amount, 2)}
                      </TableCell>
                      <TableCell sx={{ px: 1 }}>
                        <StatusChip
                          status={row.order_status}
                          pendingQty={row.pending_qty}
                          orderedQty={row.ordered_qty}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', px: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {row.expected_delivery_date ? fmtDate(row.expected_delivery_date) : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            {/* Total summary row at bottom of table */}
            {filteredRows.length > 0 && (
              <TableFooter>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.82rem', py: 1.5, px: 1 } }}>
                  <TableCell colSpan={5} align="right">
                    Totals:
                  </TableCell>
                  <TableCell align="right">{fmtNum(summary.total_ordered_qty, 2)}</TableCell>
                  <TableCell align="right" sx={{ color: '#059669' }}>
                    {fmtNum(summary.total_dispatched_qty, 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ea580c' }}>
                    {fmtNum(summary.total_pending_dispatch_qty, 2)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell align="right">
                    ₹{fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_order_amount) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#059669' }}>
                    ₹{fmtNum(filteredRows.reduce((a, b) => a + (Number(b.dispatched_amount) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ea580c' }}>
                    ₹{fmtNum(summary.total_pending_amount, 2)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>

        {/* Table Pagination */}
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sx={{ borderTop: 1, borderColor: 'divider' }}
        />
      </Paper>
    </Box>
  );
}

