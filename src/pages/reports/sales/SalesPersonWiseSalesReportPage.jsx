import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined,
  BadgeOutlined,
  CloseRounded,
  DownloadRounded,
  EmojiEventsOutlined,
  FilterListRounded,
  LocalShippingOutlined,
  OpenInNewRounded,
  PendingActionsOutlined,
  ReceiptLongOutlined,
  RefreshRounded,
  RestartAltRounded,
  SearchRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../../api/client';
import { fmtDate, fmtNum, fmtMoney } from '../../../lib/format';
import { useAuthStore } from '../../../stores/authStore';
import { palette } from '../../../theme';

function StatCard({ label, value, subtitle, icon: Icon, iconBg, iconColor }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        borderRadius: '10px',
        bgcolor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 4px 12px -2px rgba(14, 42, 47, 0.08)',
        },
      }}
    >
      <Box sx={{ minWidth: 0, mr: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 700,
            fontSize: '0.68rem',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            display: 'block',
            lineHeight: 1.2,
          }}
        >
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25, color: '#0f172a', lineHeight: 1.2 }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '0.68rem',
              mt: 0.2,
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          p: 0.85,
          borderRadius: '8px',
          bgcolor: iconBg || 'rgba(14, 42, 47, 0.06)',
          color: iconColor || palette.teal,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
      </Box>
    </Paper>
  );
}

function DispatchStatusChip({ status }) {
  let color = 'default';
  let variant = 'outlined';

  const s = String(status || '').toLowerCase();
  if (s.includes('fully')) {
    color = 'success';
    variant = 'filled';
  } else if (s.includes('partially')) {
    color = 'warning';
    variant = 'filled';
  } else if (s.includes('pending')) {
    color = 'info';
    variant = 'outlined';
  }

  return (
    <Chip
      size="small"
      label={status || 'Pending'}
      color={color}
      variant={variant}
      sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20, borderRadius: '4px' }}
    />
  );
}

export default function SalesPersonWiseSalesReportPage() {
  const { isAdmin, salesPerson } = useAuthStore();

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [productCodeFilter, setProductCodeFilter] = useState('ALL');
  const [productNameFilter, setProductNameFilter] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Main table sorting and pagination
  const [orderBy, setOrderBy] = useState('total_sales_amount');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Detail Modal State
  const [selectedSp, setSelectedSp] = useState(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(0);
  const [detailRowsPerPage, setDetailRowsPerPage] = useState(25);

  // Fetch Report Data
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'salesPersonWiseReport',
      fromDate,
      toDate,
      salesPersonFilter,
      customerFilter,
      productCodeFilter,
      productNameFilter,
      orderStatusFilter,
    ],
    queryFn: () =>
      call(
        'clssurya.api.get_sales_person_wise_report',
        {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          sales_person: salesPersonFilter !== 'ALL' ? salesPersonFilter : undefined,
          customer: customerFilter !== 'ALL' ? customerFilter : undefined,
          product_code: productCodeFilter !== 'ALL' ? productCodeFilter : undefined,
          product_name: productNameFilter || undefined,
          order_status: orderStatusFilter !== 'ALL' ? orderStatusFilter : undefined,
        },
        { get: true }
      ),
  });

  // Fetch Detail Data for Selected Sales Person
  const {
    data: detailData,
    isLoading: isDetailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: [
      'salesPersonDetailReport',
      selectedSp?.sales_person,
      fromDate,
      toDate,
      customerFilter,
      productCodeFilter,
      productNameFilter,
      orderStatusFilter,
    ],
    queryFn: () =>
      call(
        'clssurya.api.get_sales_person_detail_report',
        {
          sales_person: selectedSp.sales_person,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          customer: customerFilter !== 'ALL' ? customerFilter : undefined,
          product_code: productCodeFilter !== 'ALL' ? productCodeFilter : undefined,
          product_name: productNameFilter || undefined,
          order_status: orderStatusFilter !== 'ALL' ? orderStatusFilter : undefined,
        },
        { get: true }
      ),
    enabled: Boolean(selectedSp?.sales_person),
  });

  // Reset Filters
  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSalesPersonFilter('ALL');
    setCustomerFilter('ALL');
    setProductCodeFilter('ALL');
    setProductNameFilter('');
    setOrderStatusFilter('ALL');
    setSearchQuery('');
    setPage(0);
  };

  // Sorting Handler
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Filter & Sort Main Table Rows
  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    let result = [...rows];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          (r.sales_person_name || '').toLowerCase().includes(q) ||
          (r.sales_person || '').toLowerCase().includes(q) ||
          (r.employee_id || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [data?.rows, searchQuery, orderBy, order]);

  // Paginated Rows
  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  // Detail Filtered Rows
  const filteredDetailRows = useMemo(() => {
    const rows = detailData?.rows || [];
    if (!detailSearch.trim()) return rows;
    const q = detailSearch.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (r.sales_order_number || '').toLowerCase().includes(q) ||
        (r.quotation_number || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.product_code || '').toLowerCase().includes(q) ||
        (r.dispatch_status || '').toLowerCase().includes(q)
    );
  }, [detailData?.rows, detailSearch]);

  const paginatedDetailRows = useMemo(() => {
    const start = detailPage * detailRowsPerPage;
    return filteredDetailRows.slice(start, start + detailRowsPerPage);
  }, [filteredDetailRows, detailPage, detailRowsPerPage]);

  // Export Main Report to CSV
  const handleExportCsv = () => {
    if (!filteredRows.length) return;
    const headers = [
      'Sales Person',
      'Employee ID',
      'Total Quotations',
      'Total Sales Orders',
      'Total Dispatched Orders',
      'Total Products Sold',
      'Total Sales Amount (INR)',
      'Total Pending Amount (INR)',
      'Total Completed Amount (INR)',
      'Total Customers',
    ];

    const csvRows = filteredRows.map((r) => [
      `"${(r.sales_person_name || '').replace(/"/g, '""')}"`,
      `"${r.employee_id || ''}"`,
      r.total_quotations ?? 0,
      r.total_sales_orders ?? 0,
      r.total_dispatched_orders ?? 0,
      r.total_products_sold ?? 0,
      r.total_sales_amount ?? 0,
      r.total_pending_amount ?? 0,
      r.total_completed_amount ?? 0,
      r.total_customers ?? 0,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Sales_Person_Wise_Sales_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Detail Modal to CSV
  const handleExportDetailCsv = () => {
    if (!filteredDetailRows.length) return;
    const headers = [
      'Sales Person',
      'Quotation Number',
      'Sales Order Number',
      'Customer Name',
      'Order Date',
      'Product Name',
      'Product Code',
      'Ordered Qty',
      'Dispatched Qty',
      'Pending Qty',
      'Rate (INR)',
      'Total Amount (INR)',
      'Dispatch Status',
    ];

    const csvRows = filteredDetailRows.map((r) => [
      `"${(r.sales_person_name || '').replace(/"/g, '""')}"`,
      `"${r.quotation_number || ''}"`,
      `"${r.sales_order_number || ''}"`,
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      `"${r.order_date || ''}"`,
      `"${(r.product_name || '').replace(/"/g, '""')}"`,
      `"${r.product_code || ''}"`,
      r.ordered_qty ?? 0,
      r.dispatched_qty ?? 0,
      r.pending_qty ?? 0,
      r.rate ?? 0,
      r.total_amount ?? 0,
      `"${r.dispatch_status || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    const spClean = (selectedSp?.sales_person_name || 'Detail').replace(/\s+/g, '_');
    link.setAttribute('download', `${spClean}_Sales_Details_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = data?.summary || {
    total_sales_persons: 0,
    total_sales_orders: 0,
    total_dispatched_qty: 0,
    total_sales_amount: 0,
    total_pending_orders: 0,
    best_performing_sales_person: 'N/A',
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, width: '100%', boxSizing: 'border-box' }}>
      {/* Title & Actions */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3, lineHeight: 1.2 }}>
            Sales Person Report
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            Overview of sales performance, orders, dispatches, and sales values by sales person
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
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
            startIcon={<DownloadRounded />}
            onClick={handleExportCsv}
            disabled={!filteredRows.length}
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

      {/* Summary Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(6, 1fr)',
          },
          gap: 1.25,
          mb: 1.5,
        }}
      >
        <StatCard
          label="Sales Persons"
          value={isLoading ? <Skeleton width={40} /> : summary.total_sales_persons}
          subtitle="In report"
          icon={BadgeOutlined}
          iconBg="rgba(14, 42, 47, 0.08)"
          iconColor={palette.teal}
        />
        <StatCard
          label="Total Orders"
          value={isLoading ? <Skeleton width={50} /> : summary.total_sales_orders}
          subtitle="Active orders"
          icon={ReceiptLongOutlined}
          iconBg="rgba(59, 130, 246, 0.1)"
          iconColor="#2563eb"
        />
        <StatCard
          label="Dispatched Qty"
          value={isLoading ? <Skeleton width={50} /> : fmtNum(summary.total_dispatched_qty, 0)}
          subtitle="Confirmed dispatches"
          icon={LocalShippingOutlined}
          iconBg="rgba(16, 185, 129, 0.1)"
          iconColor="#059669"
        />
        <StatCard
          label="Sales Value"
          value={isLoading ? <Skeleton width={70} /> : `₹${fmtNum(summary.total_sales_amount, 0)}`}
          subtitle="Actual dispatched"
          icon={AccountBalanceWalletOutlined}
          iconBg="rgba(139, 92, 246, 0.1)"
          iconColor="#7c3aed"
        />
        <StatCard
          label="Pending Orders"
          value={isLoading ? <Skeleton width={40} /> : summary.total_pending_orders}
          subtitle="Awaiting dispatch"
          icon={PendingActionsOutlined}
          iconBg="rgba(245, 158, 11, 0.1)"
          iconColor="#d97706"
        />
        <StatCard
          label="Top Performer"
          value={
            isLoading ? (
              <Skeleton width={70} />
            ) : (
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: '#0f172a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 130,
                  lineHeight: 1.3,
                }}
              >
                {summary.best_performing_sales_person}
              </Typography>
            )
          }
          subtitle="Highest value"
          icon={EmojiEventsOutlined}
          iconBg="rgba(234, 179, 8, 0.15)"
          iconColor="#ca8a04"
        />
      </Box>

      {/* Filter Toolbar */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: '10px', bgcolor: '#ffffff' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
              lg: isAdmin ? 'repeat(7, 1fr)' : 'repeat(6, 1fr)',
            },
            gap: 1,
            mb: 1,
          }}
        >
          {/* From Date */}
          <TextField
            label="From Date"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          {/* To Date */}
          <TextField
            label="To Date"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          {/* Sales Person (Admin only) */}
          {isAdmin && (
            <FormControl size="small" fullWidth>
              <InputLabel>Sales Person</InputLabel>
              <Select
                label="Sales Person"
                value={salesPersonFilter}
                onChange={(e) => {
                  setSalesPersonFilter(e.target.value);
                  setPage(0);
                }}
              >
                {(data?.sales_persons || [{ value: 'ALL', label: 'All Sales Persons' }]).map((sp) => (
                  <MenuItem key={sp.value} value={sp.value}>
                    {sp.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Customer */}
          <FormControl size="small" fullWidth>
            <InputLabel>Customer</InputLabel>
            <Select
              label="Customer"
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(0);
              }}
            >
              {(data?.customers || [{ value: 'ALL', label: 'All Customers' }]).map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Product Code */}
          <FormControl size="small" fullWidth>
            <InputLabel>Product Code</InputLabel>
            <Select
              label="Product Code"
              value={productCodeFilter}
              onChange={(e) => {
                setProductCodeFilter(e.target.value);
                setPage(0);
              }}
            >
              {(data?.products || [{ value: 'ALL', label: 'All Products' }]).map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Product Name Search */}
          <TextField
            label="Product Name"
            size="small"
            placeholder="Search product..."
            value={productNameFilter}
            onChange={(e) => {
              setProductNameFilter(e.target.value);
              setPage(0);
            }}
            fullWidth
          />

          {/* Sales Order Status */}
          <FormControl size="small" fullWidth>
            <InputLabel>Order Status</InputLabel>
            <Select
              label="Order Status"
              value={orderStatusFilter}
              onChange={(e) => {
                setOrderStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              {(data?.order_statuses || [{ value: 'ALL', label: 'All Statuses' }]).map((st) => (
                <MenuItem key={st.value} value={st.value}>
                  {st.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Search & Reset Bar */}
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Quick search sales person, ID, or email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded sx={{ color: 'text.secondary', fontSize: 18 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <CloseRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />

          <Button
            variant="text"
            size="small"
            startIcon={<RestartAltRounded sx={{ fontSize: 16 }} />}
            onClick={handleResetFilters}
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            Clear Filters
          </Button>
        </Stack>
      </Paper>

      {/* Main Table */}
      <Paper variant="outlined" sx={{ borderRadius: '10px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f8fafc', fontWeight: 700, fontSize: '0.78rem', py: 1, px: 1.2, whiteSpace: 'nowrap' } }}>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'sales_person_name'}
                    direction={orderBy === 'sales_person_name' ? order : 'asc'}
                    onClick={() => handleRequestSort('sales_person_name')}
                  >
                    Sales Person
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_quotations'}
                    direction={orderBy === 'total_quotations' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_quotations')}
                  >
                    Quotations
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_sales_orders'}
                    direction={orderBy === 'total_sales_orders' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_sales_orders')}
                  >
                    Orders
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_dispatched_orders'}
                    direction={orderBy === 'total_dispatched_orders' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_dispatched_orders')}
                  >
                    Dispatched
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_products_sold'}
                    direction={orderBy === 'total_products_sold' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_products_sold')}
                  >
                    Qty Sold
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_sales_amount'}
                    direction={orderBy === 'total_sales_amount' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_sales_amount')}
                  >
                    Sales Value
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_pending_amount'}
                    direction={orderBy === 'total_pending_amount' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_pending_amount')}
                  >
                    Pending Value
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_completed_amount'}
                    direction={orderBy === 'total_completed_amount' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_completed_amount')}
                  >
                    Completed Value
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'total_customers'}
                    direction={orderBy === 'total_customers' ? order : 'asc'}
                    onClick={() => handleRequestSort('total_customers')}
                  >
                    Customers
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j} sx={{ py: 1, px: 1.2 }}>
                        <Skeleton />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      No sales records found matching the criteria.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row) => (
                  <TableRow
                    key={row.sales_person}
                    hover
                    onClick={() => setSelectedSp(row)}
                    sx={{
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                      '&:hover': { bgcolor: 'rgba(14, 42, 47, 0.04)' },
                      '& td': { py: 0.85, px: 1.2, whiteSpace: 'nowrap' },
                    }}
                  >
                    {/* Sales Person Name */}
                    <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: palette.teal, fontSize: '0.84rem' }}>
                          {row.sales_person_name}
                        </Typography>
                        {row.employee_id && row.employee_id !== '-' && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                            ID: {row.employee_id}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>

                    {/* Total Quotations */}
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {fmtNum(row.total_quotations, 0)}
                    </TableCell>

                    {/* Total Sales Orders */}
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {fmtNum(row.total_sales_orders, 0)}
                    </TableCell>

                    {/* Total Dispatched Orders */}
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem', color: palette.teal }}>
                      {fmtNum(row.total_dispatched_orders, 0)}
                    </TableCell>

                    {/* Total Products Sold */}
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#059669' }}>
                      {fmtNum(row.total_products_sold, 2)}
                    </TableCell>

                    {/* Total Sales Amount */}
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      ₹{fmtNum(row.total_sales_amount, 2)}
                    </TableCell>

                    {/* Total Pending Amount */}
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: row.total_pending_amount > 0 ? '#ea580c' : 'text.secondary',
                      }}
                    >
                      ₹{fmtNum(row.total_pending_amount, 2)}
                    </TableCell>

                    {/* Total Completed Amount */}
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: row.total_completed_amount > 0 ? '#7c3aed' : 'text.secondary',
                      }}
                    >
                      ₹{fmtNum(row.total_completed_amount, 2)}
                    </TableCell>

                    {/* Total Customers */}
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {fmtNum(row.total_customers, 0)}
                    </TableCell>

                    {/* Action */}
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Breakdown">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setSelectedSp(row)}
                          sx={{ '&:hover': { bgcolor: 'rgba(14, 42, 47, 0.08)' }, p: 0.5 }}
                        >
                          <OpenInNewRounded sx={{ fontSize: 16, color: palette.teal }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>

            {/* Total Footer Row */}
            {filteredRows.length > 0 && (
              <TableFooter>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.82rem', py: 1, px: 1.2, whiteSpace: 'nowrap' } }}>
                  <TableCell>Total ({filteredRows.length} Sales Persons)</TableCell>
                  <TableCell align="right">
                    {fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_quotations) || 0), 0), 0)}
                  </TableCell>
                  <TableCell align="right">
                    {fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_sales_orders) || 0), 0), 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: palette.teal }}>
                    {fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_dispatched_orders) || 0), 0), 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#059669' }}>
                    {fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_products_sold) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right">
                    ₹{fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_sales_amount) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ea580c' }}>
                    ₹{fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_pending_amount) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#7c3aed' }}>
                    ₹{fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_completed_amount) || 0), 0), 2)}
                  </TableCell>
                  <TableCell align="right">
                    {fmtNum(filteredRows.reduce((a, b) => a + (Number(b.total_customers) || 0), 0), 0)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>

        {/* Pagination */}
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

      {/* Drill-Down Detail Dialog */}
      <Dialog
        open={Boolean(selectedSp)}
        onClose={() => {
          setSelectedSp(null);
          setDetailSearch('');
          setDetailPage(0);
        }}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', maxHeight: '90vh' },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                Sales Details - {selectedSp?.sales_person_name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Item-level order status, dispatched quantities, rates, and amounts
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadRounded sx={{ fontSize: 16 }} />}
                onClick={handleExportDetailCsv}
                disabled={!filteredDetailRows.length}
                sx={{ borderRadius: '6px', textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', py: 0.4 }}
              >
                Export CSV
              </Button>
              <IconButton
                size="small"
                onClick={() => {
                  setSelectedSp(null);
                  setDetailSearch('');
                  setDetailPage(0);
                }}
              >
                <CloseRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: 2 }}>
          {/* Detail Search */}
          <Box sx={{ mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search by SO #, Quotation #, customer, product..."
              value={detailSearch}
              onChange={(e) => {
                setDetailSearch(e.target.value);
                setDetailPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded sx={{ color: 'text.secondary', fontSize: 18 }} />
                  </InputAdornment>
                ),
                endAdornment: detailSearch && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setDetailSearch('')}>
                      <CloseRounded sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              fullWidth
            />
          </Box>

          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px', maxHeight: 420 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', py: 0.8, px: 1, whiteSpace: 'nowrap' } }}>
                  <TableCell>Sales Person</TableCell>
                  <TableCell>Quotation No</TableCell>
                  <TableCell>Order No</TableCell>
                  <TableCell>Customer </TableCell>
                  <TableCell>Order Date</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Product Code</TableCell>
                  <TableCell align="right">Ordered Qty</TableCell>
                  <TableCell align="right">Disp. Qty</TableCell>
                  <TableCell align="right">Pend. Qty</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right">Total Amount</TableCell>
                  <TableCell align="center">Dispatch Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isDetailLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 13 }).map((_, j) => (
                        <TableCell key={j} sx={{ py: 0.8, px: 1 }}>
                          <Skeleton />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedDetailRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No item records found for this sales person.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDetailRows.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ '& td': { py: 0.75, px: 1, whiteSpace: 'nowrap' } }}>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{row.sales_person_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{row.quotation_number}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600, color: palette.teal }}>
                        {row.sales_order_number}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{row.customer_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>
                        {row.order_date ? fmtDate(row.order_date) : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.product_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{row.product_code}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                        {fmtNum(row.ordered_qty, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#059669' }}>
                        {fmtNum(row.dispatched_qty, 2)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: row.pending_qty > 0 ? '#ea580c' : '#059669',
                        }}
                      >
                        {fmtNum(row.pending_qty, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem' }}>
                        ₹{fmtNum(row.rate, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                        ₹{fmtNum(row.total_amount, 2)}
                      </TableCell>
                      <TableCell align="center">
                        <DispatchStatusChip status={row.dispatch_status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {filteredDetailRows.length > 0 && (
                <TableFooter>
                  <TableRow sx={{ '& td': { bgcolor: '#f8fafc', fontWeight: 700, fontSize: '0.78rem', py: 0.8, px: 1, whiteSpace: 'nowrap' } }}>
                    <TableCell colSpan={7} align="right">
                      Subtotals:
                    </TableCell>
                    <TableCell align="right">
                      {fmtNum(filteredDetailRows.reduce((a, b) => a + (Number(b.ordered_qty) || 0), 0), 2)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#059669' }}>
                      {fmtNum(filteredDetailRows.reduce((a, b) => a + (Number(b.dispatched_qty) || 0), 0), 2)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#ea580c' }}>
                      {fmtNum(filteredDetailRows.reduce((a, b) => a + (Number(b.pending_qty) || 0), 0), 2)}
                    </TableCell>
                    <TableCell />
                    <TableCell align="right">
                      ₹{fmtNum(filteredDetailRows.reduce((a, b) => a + (Number(b.total_amount) || 0), 0), 2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredDetailRows.length}
            page={detailPage}
            onPageChange={(_, newPage) => setDetailPage(newPage)}
            rowsPerPage={detailRowsPerPage}
            onRowsPerPageChange={(e) => {
              setDetailRowsPerPage(parseInt(e.target.value, 10));
              setDetailPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1, bgcolor: '#f8fafc', borderTop: 1, borderColor: 'divider' }}>
          <Button
            onClick={() => {
              setSelectedSp(null);
              setDetailSearch('');
              setDetailPage(0);
            }}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
