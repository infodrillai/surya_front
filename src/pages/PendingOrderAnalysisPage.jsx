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
  PendingActionsOutlined,
  ReceiptLongOutlined,
  RefreshRounded,
  SearchRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
  if (s.includes('cancel')) {
    color = 'error';
    label = 'Cancelled';
  } else if (pendingQty <= 0.00001 && orderedQty > 0) {
    color = 'success';
    variant = 'filled';
    label = 'Fully Received';
  } else if (s.includes('partially') || (pendingQty < orderedQty && pendingQty > 0)) {
    color = 'warning';
    variant = 'filled';
    label = 'Partially Received';
  } else if (s.includes('order')) {
    color = 'info';
    label = 'Ordered';
  } else if (s.includes('draft')) {
    color = 'default';
    label = 'Draft';
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

export default function PendingOrderAnalysisPage() {
  // Filters
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch report data
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pendingOrderAnalysis', fromDate, toDate, vendorFilter, productFilter, includeCompleted],
    queryFn: async () => {
      const res = await call('clssurya.api.get_pending_order_analysis', {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        vendor: vendorFilter !== 'ALL' ? vendorFilter : undefined,
        product: productFilter !== 'ALL' ? productFilter : undefined,
        include_completed: includeCompleted ? 1 : 0,
      });
      return res || { rows: [], summary: {}, vendors: [], products: [] };
    },
    staleTime: 30 * 1000,
  });

  const rawRows = data?.rows || [];
  const vendorOptions = data?.vendors || [{ value: 'ALL', label: 'All Vendors' }];
  const productOptions = data?.products || [{ value: 'ALL', label: 'All Products' }];

  // Client-side quick search filtering
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rawRows;
    const q = searchQuery.toLowerCase().trim();
    return rawRows.filter((r) =>
      (r.purchase_entry_id || '').toLowerCase().includes(q) ||
      (r.vendor_name || '').toLowerCase().includes(q) ||
      (r.product_code || '').toLowerCase().includes(q) ||
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.order_status || '').toLowerCase().includes(q)
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
    let totReceived = 0;
    let totPending = 0;
    let totPendingVal = 0;

    filteredRows.forEach((r) => {
      totOrdered += Number(r.ordered_qty) || 0;
      totReceived += Number(r.received_qty) || 0;
      totPending += Number(r.pending_qty) || 0;
      totPendingVal += Number(r.pending_value) || 0;
    });

    return {
      total_ordered_qty: totOrdered,
      total_received_qty: totReceived,
      total_pending_qty: totPending,
      total_pending_value: totPendingVal,
      count: filteredRows.length,
    };
  }, [filteredRows]);

  // Quick Date Helpers
  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setFromDate(firstDay);
    setToDate(lastDay);
    setPage(0);
  };

  const setAllTime = () => {
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  // Export to CSV
  const exportCsv = () => {
    if (!filteredRows.length) return;
    const headers = [
      'Purchase Entry ID',
      'Purchase Date',
      'Vendor Name',
      'Product Code',
      'Product Name',
      'UOM',
      'Total Ordered Quantity',
      'Received Quantity',
      'Pending Quantity',
      'Purchase Unit Rate (INR)',
      'Landed Rate (INR)',
      'Pending Value (INR)',
      'Order Status',
    ];

    const csvRows = filteredRows.map((r) => [
      `"${r.purchase_entry_id || ''}"`,
      `"${r.purchase_date || ''}"`,
      `"${(r.vendor_name || '').replace(/"/g, '""')}"`,
      `"${r.product_code || ''}"`,
      `"${(r.product_name || '').replace(/"/g, '""')}"`,
      `"${r.uom || ''}"`,
      r.ordered_qty ?? 0,
      r.received_qty ?? 0,
      r.pending_qty ?? 0,
      r.unit_rate ?? 0,
      r.landed_rate ?? 0,
      r.pending_value ?? 0,
      `"${r.order_status || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Pending_Order_Analysis_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Page Title & Actions */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
            Pending Order Analysis
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Compare purchase orders against confirmed goods receipts to track pending vendor deliveries.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshRounded sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />}
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
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {/* Filter Section */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '12px', mb: 3, bgcolor: '#ffffff' }}>
        {/* <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <FilterListRounded sx={{ color: palette.teal, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Report Filters
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={setThisMonth} sx={{ textTransform: 'none', fontSize: '0.78rem' }}>
            This Month
          </Button>
          <Button size="small" onClick={setAllTime} sx={{ textTransform: 'none', fontSize: '0.78rem' }}>
            All Time
          </Button>
        </Stack> */}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {/* Filter 1: Vendor Wise */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Vendor Wise
            </Typography>
            <Select
              value={vendorFilter}
              onChange={(e) => {
                setVendorFilter(e.target.value);
                setPage(0);
              }}
              displayEmpty
              sx={{ borderRadius: '8px' }}
            >
              {vendorOptions.map((v) => (
                <MenuItem key={v.value} value={v.value}>
                  {v.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Filter 2: Product Wise */}
          <FormControl size="small" fullWidth>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Product Wise
            </Typography>
            <Select
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
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

          {/* Date: From Date */}
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

          {/* Date: To Date */}
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
        </Box>

        <Divider sx={{ my: 2 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
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
                Include Completed / Fully Received Items (Pending = 0)
              </Typography>
            }
          />

          {/* Quick Search */}
          <TextField
            size="small"
            placeholder="Search by ID, Vendor, Product..."
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
            sx={{ width: { xs: '100%', sm: 300 }, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Stack>
      </Paper>

      {/* Summary KPI Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {/* <StatCard
          label="Total Ordered Qty"
          value={fmtNum(summary.total_ordered_qty, 2)}
          subtitle={`${summary.count} line items`}
          icon={ReceiptLongOutlined}
          iconBg="rgba(59, 130, 246, 0.1)"
          iconColor="#2563eb"
        /> */}
        {/* <StatCard
          label="Total Received Qty"
          value={fmtNum(summary.total_received_qty, 2)}
          subtitle="Confirmed Receipts"
          icon={CheckCircleOutlineRounded}
          iconBg="rgba(16, 185, 129, 0.1)"
          iconColor="#059669"
        /> */}
        <StatCard
          label="Total Pending Qty"
          value={fmtNum(summary.total_pending_qty, 2)}
          subtitle="Remaining to receive"
          icon={PendingActionsOutlined}
          iconBg="rgba(245, 158, 11, 0.1)"
          iconColor="#d97706"
        />
        <StatCard
          label="Pending Order Value"
          value={`₹${fmtNum(summary.total_pending_value, 2)}`}
          subtitle="Value at purchase rate"
          icon={Inventory2Outlined}
          iconBg="rgba(14, 42, 47, 0.1)"
          iconColor={palette.teal}
        />
      </Box>

      {/* Table Section */}
      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.75rem', py: 1.25 } }}>
                <TableCell width={50} align="center">#</TableCell>
                <TableCell>Purchase Entry ID</TableCell>
                <TableCell>Purchase Date</TableCell>
                <TableCell>Vendor Name</TableCell>
                
                <TableCell>Product Name</TableCell>
                <TableCell align="right">Total Ordered Qty</TableCell>
                <TableCell align="right">Received Qty</TableCell>
                <TableCell align="right">Pending Qty</TableCell>
                <TableCell align="right">Purchase Rate (₹)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 6 }}>
                    <Typography color="error" variant="body2">
                      Failed to load Pending Order Analysis: {error?.message || 'Unknown error'}
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => refetch()} sx={{ mt: 1.5, borderRadius: '6px' }}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 8 }}>
                    <Box sx={{ color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineRounded sx={{ fontSize: 44, color: '#94a3b8' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#334155' }}>
                        No Pending Purchase Orders Found
                      </Typography>
                      <Typography variant="body2" sx={{ maxWidth: 450, color: 'text.secondary' }}>
                        {includeCompleted
                          ? 'No purchase orders match the selected filters.'
                          : 'All orders under the selected criteria are fully received. Check "Include Completed" above to view fulfilled orders.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isFullyPending = row.received_qty <= 0.00001;
                  const isFullyReceived = row.pending_qty <= 0.00001;
                  const isPartiallyReceived = !isFullyPending && !isFullyReceived;

                  return (
                    <TableRow
                      key={`${row.purchase_entry_id}-${row.product_code}-${idx}`}
                      hover
                      sx={{
                        bgcolor: isFullyReceived ? 'rgba(240, 253, 244, 0.4)' : 'inherit',
                        '&:hover': { bgcolor: isFullyReceived ? 'rgba(240, 253, 244, 0.8) !important' : undefined },
                      }}
                    >
                      <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, color: palette.teal, fontSize: '0.82rem' }}>
                        {row.purchase_entry_id}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {fmtDate(row.purchase_date)}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500, fontSize: '0.82rem' }}>
                        {row.vendor_name}
                      </TableCell>
                      
                      <TableCell sx={{ fontSize: '0.82rem' }}>
                        {row.product_name}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {fmtNum(row.ordered_qty, 2)} {row.uom}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#059669', fontWeight: 600, fontSize: '0.82rem' }}>
                        {fmtNum(row.received_qty, 2)} {row.uom}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: isFullyReceived ? '#059669' : isPartiallyReceived ? '#d97706' : '#ea580c',
                        }}
                      >
                        {fmtNum(row.pending_qty, 2)} {row.uom}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.82rem' }}>
                        ₹{fmtNum(row.unit_rate, 2)}
                      </TableCell>
                      
                    </TableRow>
                  );
                })
              )}
            </TableBody>
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
