import { fmtMoney as formatChartMoney } from '../../../lib/format';
import ReportChart, { groupChartRows } from '../../../components/ReportChart';
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AnalyticsOutlined as AnalyticsIcon,
  CloseRounded as CloseIcon,
  DownloadRounded as DownloadIcon,
  RefreshRounded as RefreshIcon,
  RestartAltRounded as ResetIcon,
  SearchRounded as SearchIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { getList } from '../../../api/client';
import { fmtDate, fmtMoney, fmtNum } from '../../../lib/format';
import { useAuthStore } from '../../../stores/authStore';
import { palette } from '../../../theme';

export default function SalesReportsPage() {
  const { isAdmin, salesPerson } = useAuthStore();
  const [activeTab, setActiveTab] = useState(0);

  // Date filters
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [searchQuery, setSearchQuery] = useState('');

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchQuery('');
  };

  // Fetch Quotations
  const { data: quotations = [], isLoading: qLoading, refetch: refetchQ } = useQuery({
    queryKey: ['sales_reports_quotations'],
    queryFn: () => getList('Quotation').catch(() => []),
  });

  // Fetch Sales Orders
  const { data: salesOrders = [], isLoading: soLoading, refetch: refetchSO } = useQuery({
    queryKey: ['sales_reports_sales_orders'],
    queryFn: () => getList('Sales Order').catch(() => []),
  });

  const handleRefresh = () => {
    refetchQ();
    refetchSO();
  };

  // Filtered Quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      const dt = q.quotation_date || q.creation;
      const dStr = dt ? String(dt).slice(0, 10) : '';
      if (fromDate && dStr && dStr < fromDate) return false;
      if (toDate && dStr && dStr > toDate) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const cust = (q.customer || '').toLowerCase();
        const name = (q.name || '').toLowerCase();
        if (!cust.includes(query) && !name.includes(query)) return false;
      }
      return true;
    });
  }, [quotations, fromDate, toDate, searchQuery]);

  // Filtered Sales Orders
  const filteredOrders = useMemo(() => {
    return salesOrders.filter((so) => {
      const dt = so.transaction_date || so.order_date || so.creation;
      const dStr = dt ? String(dt).slice(0, 10) : '';
      if (fromDate && dStr && dStr < fromDate) return false;
      if (toDate && dStr && dStr > toDate) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const cust = (so.customer || '').toLowerCase();
        const name = (so.name || '').toLowerCase();
        if (!cust.includes(query) && !name.includes(query)) return false;
      }
      return true;
    });
  }, [salesOrders, fromDate, toDate, searchQuery]);

  // 1. Customer-wise Sales Aggregation
  const customerSummary = useMemo(() => {
    const map = new Map();
    filteredOrders.forEach((so) => {
      const cust = so.customer || 'Unknown';
      if (!map.has(cust)) {
        map.set(cust, {
          customer: cust,
          orderCount: 0,
          totalAmount: 0,
          pendingAmount: 0,
          completedCount: 0,
        });
      }
      const entry = map.get(cust);
      entry.orderCount += 1;
      const total = Number(so.grand_total || so.total_amount || 0);
      entry.totalAmount += total;
      if (so.status === 'Completed') entry.completedCount += 1;
      else entry.pendingAmount += total;
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredOrders]);

  // 2. Quotation Status Summary
  const quotationStatusSummary = useMemo(() => {
    const map = new Map();
    filteredQuotations.forEach((q) => {
      const st = q.status || 'Draft';
      if (!map.has(st)) map.set(st, { status: st, count: 0, totalAmount: 0 });
      const entry = map.get(st);
      entry.count += 1;
      entry.totalAmount += Number(q.grand_total || q.net_amount || 0);
    });
    return Array.from(map.values());
  }, [filteredQuotations]);

  // 3. Performance Summary
  const performanceSummary = useMemo(() => {
    const totalQ = filteredQuotations.length;
    const acceptedQ = filteredQuotations.filter((q) => q.status === 'Accepted').length;
    const totalSO = filteredOrders.length;
    const totalSales = filteredOrders.reduce((acc, so) => acc + Number(so.grand_total || so.total_amount || 0), 0);
    const conversionRate = totalQ > 0 ? (acceptedQ / totalQ) * 100 : 0;
    return { totalQ, acceptedQ, totalSO, totalSales, conversionRate };
  }, [filteredQuotations, filteredOrders]);

  // Export CSV
  const handleExportCSV = () => {
    let headers = [];
    let rows = [];
    let filename = 'sales_report.csv';

    if (activeTab === 0) {
      // Sales Orders
      filename = `Sales_Orders_${fromDate}_to_${toDate}.csv`;
      headers = ['#', 'Order ID', 'Date', 'Customer', 'Sales Person', 'Status', 'Grand Total'];
      rows = filteredOrders.map((so, i) => [
        i + 1,
        `"${so.name}"`,
        `"${so.transaction_date || so.creation || ''}"`,
        `"${so.customer || ''}"`,
        `"${so.sales_person || ''}"`,
        `"${so.status || 'Draft'}"`,
        Number(so.grand_total || 0).toFixed(3),
      ]);
    } else if (activeTab === 1) {
      // Customer Wise
      filename = `Customer_Wise_Sales_${fromDate}_to_${toDate}.csv`;
      headers = ['#', 'Customer', 'Orders Count', 'Total Sales Amount', 'Pending Amount'];
      rows = customerSummary.map((c, i) => [
        i + 1,
        `"${c.customer}"`,
        c.orderCount,
        c.totalAmount.toFixed(3),
        c.pendingAmount.toFixed(3),
      ]);
    } else {
      // Quotations
      filename = `Quotations_Report_${fromDate}_to_${toDate}.csv`;
      headers = ['#', 'Quotation ID', 'Date', 'Customer', 'Status', 'Grand Total'];
      rows = filteredQuotations.map((q, i) => [
        i + 1,
        `"${q.name}"`,
        `"${q.quotation_date || q.creation || ''}"`,
        `"${q.customer || ''}"`,
        `"${q.status || 'Draft'}"`,
        Number(q.grand_total || 0).toFixed(3),
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLoading = qLoading || soLoading;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AnalyticsIcon sx={{ fontSize: 28, color: palette.teal }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
              Sales Reports & Analytics
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isAdmin
              ? 'Complete sales metrics across all accounts, orders, and sales performance.'
              : `Sales metrics filtered for ${salesPerson?.sales_person_name || 'your account'}.`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="contained"
            size="small"
            startIcon={
              <RefreshIcon
                fontSize="small"
                sx={{
                  animation: isLoading ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                }}
              />
            }
            onClick={handleRefresh}
            disabled={isLoading}
            sx={{
              bgcolor: '#0284c7',
              color: '#ffffff',
              '&:hover': { bgcolor: '#0369a1' },
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: 'none',
              fontWeight: 600,
            }}
          >
            Refresh
          </Button>

          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={handleExportCSV}
            sx={{
              bgcolor: '#16a34a',
              color: '#ffffff',
              '&:hover': { bgcolor: '#15803d' },
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: 'none',
              fontWeight: 600,
            }}
          >
            Export Excel
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ mb: 2.5 }}>
        <ReportChart title="Monthly sales order value" points={groupChartRows(filteredOrders, (row) => (row.order_date || row.creation)?.slice(0, 7), (row) => row.grand_total)} format={formatChartMoney} chronological />
      </Box>

      {/* KPI Performance Bar */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
            TOTAL SALES ORDERS
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: '#2563eb' }}>
            {performanceSummary.totalSO}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
            TOTAL SALES VALUE
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: '#059669' }}>
            {fmtMoney(performanceSummary.totalSales, 3)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
            TOTAL QUOTATIONS
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: '#4338ca' }}>
            {performanceSummary.totalQ}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
            CONVERSION RATE
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: '#d97706' }}>
            {fmtNum(performanceSummary.conversionRate, 2)}%
          </Typography>
        </Paper>
      </Box>

      {/* Filters - Single Line */}
      <Paper variant="outlined" sx={{ p: 1.5, pt: 2, pb: 1.5, mb: 2.5, borderRadius: '12px', bgcolor: '#ffffff', overflow: 'visible' }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          useFlexGap
          sx={{
            width: '100%',
            flexWrap: 'wrap',
            '& > *': { maxWidth: '100%' },
          }}
        >
          {/* Quick Search */}
          <TextField
            size="small"
            placeholder="Quick search customer or order..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{ flex: '1.4 1 200px', minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* From Date */}
          <TextField
            type="date"
            label="From Date"
            size="small"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: '0 0 auto', width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* To Date */}
          <TextField
            type="date"
            label="To Date"
            size="small"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: '0 0 auto', width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* Clear Filters */}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<ResetIcon fontSize="small" />}
            onClick={handleResetFilters}
            sx={{
              flex: '0 0 auto',
              minWidth: 110,
              height: 38,
              textTransform: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              color: 'text.secondary',
              borderColor: '#cbd5e1',
              whiteSpace: 'nowrap',
            }}
          >
            Clear Filters
          </Button>

          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {fromDate && toDate ? `Records: ${fmtDate(fromDate)} to ${fmtDate(toDate)}` : ''}
          </Typography>
        </Stack>
      </Paper>

      {/* Tabs */}
      <Tabs
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Sales Orders (Date-wise)" />
        <Tab label="Customer-wise Sales" />
        <Tab label="Quotations Status Report" />
      </Tabs>

      {/* Tab 0: Sales Orders Date-wise */}
      {activeTab === 0 && (
        <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer sx={{ maxHeight: 650 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.75rem', py: 1.25 } }}>
                  <TableCell>#</TableCell>
                  <TableCell>Order ID</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Grand Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No Sales Orders in this date range.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((so, idx) => (
                    <TableRow key={so.name} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>{idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem', color: palette.teal }}>{so.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.82rem' }}>{fmtDate(so.transaction_date || so.creation)}</TableCell>
                      <TableCell sx={{ fontWeight: 500, fontSize: '0.82rem' }}>{so.customer}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={so.status || 'Draft'}
                          color={so.status === 'Completed' ? 'success' : so.status === 'Approved' ? 'primary' : 'default'}
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px' }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: '0.85rem' }}>
                        {fmtMoney(so.grand_total, 3)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab 1: Customer-wise Sales */}
      {activeTab === 1 && (
        <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer sx={{ maxHeight: 650 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.75rem', py: 1.25 } }}>
                  <TableCell>#</TableCell>
                  <TableCell>Customer Name</TableCell>
                  <TableCell align="center">Orders Count</TableCell>
                  <TableCell align="center">Completed Orders</TableCell>
                  <TableCell align="right">Pending Amount</TableCell>
                  <TableCell align="right">Total Sales Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : customerSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No customer data found.
                    </TableCell>
                  </TableRow>
                ) : (
                  customerSummary.map((c, idx) => (
                    <TableRow key={c.customer} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>{idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>{c.customer}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem' }}>{c.orderCount}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>{c.completedCount}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#d97706' }}>{fmtMoney(c.pendingAmount, 3)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: '0.85rem' }}>
                        {fmtMoney(c.totalAmount, 3)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab 2: Quotations Status */}
      {activeTab === 2 && (
        <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer sx={{ maxHeight: 650 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.75rem', py: 1.25 } }}>
                  <TableCell>Quotation Status</TableCell>
                  <TableCell align="center">Count</TableCell>
                  <TableCell align="right">Total Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotationStatusSummary.map((s) => (
                  <TableRow key={s.status} hover>
                    <TableCell>
                      <Chip
                        label={s.status}
                        size="small"
                        color={s.status === 'Accepted' ? 'success' : s.status === 'Approved' ? 'primary' : 'default'}
                        sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: '6px' }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.count}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: '0.85rem' }}>
                      {fmtMoney(s.totalAmount, 3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}

