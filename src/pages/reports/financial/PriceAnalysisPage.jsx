import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  FilterListRounded,
  HandshakeOutlined,
  Inventory2Outlined,
  LocalShippingOutlined,
  PriceChangeOutlined,
  ReceiptLongOutlined,
  RefreshRounded,
  RestartAltRounded,
  SearchRounded,
  ShoppingCartOutlined,
  StorefrontOutlined,
  TrendingDownRounded,
  TrendingUpRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../../api/client';
import { fmtDate, fmtNum } from '../../../lib/format';
import { palette } from '../../../theme';

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

export default function PriceAnalysisPage() {
  // Mode: 'purchase' | 'selling'
  const [reportType, setReportType] = useState('purchase');

  // Common Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productNameFilter, setProductNameFilter] = useState('');
  const [productCodeFilter, setProductCodeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [uomFilter, setUomFilter] = useState('ALL');

  // Purchase-Wise Filters
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [purchaseEntryFilter, setPurchaseEntryFilter] = useState('');

  // Selling-Wise Filters
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [salesOrderFilter, setSalesOrderFilter] = useState('');
  const [dispatchFilter, setDispatchFilter] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('ALL');

  // Quick Search & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('product_name');
  const [orderDir, setOrderDir] = useState('asc');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const handleReportTypeChange = (_, nextType) => {
    if (nextType && nextType !== reportType) {
      setReportType(nextType);
      setPage(0);
    }
  };

  // Fetch report data
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'priceAnalysis',
      reportType,
      fromDate,
      toDate,
      productNameFilter,
      productCodeFilter,
      categoryFilter,
      uomFilter,
      vendorFilter,
      purchaseEntryFilter,
      customerFilter,
      salesOrderFilter,
      dispatchFilter,
      salesPersonFilter,
    ],
    queryFn: async () => {
      const res = await call('clssurya.api.get_price_analysis', {
        report_type: reportType,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        product: productNameFilter || undefined,
        product_code: productCodeFilter || undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        uom: uomFilter !== 'ALL' ? uomFilter : undefined,
        vendor: reportType === 'purchase' && vendorFilter !== 'ALL' ? vendorFilter : undefined,
        purchase_entry: reportType === 'purchase' && purchaseEntryFilter ? purchaseEntryFilter : undefined,
        customer: reportType === 'selling' && customerFilter !== 'ALL' ? customerFilter : undefined,
        sales_order: reportType === 'selling' && salesOrderFilter ? salesOrderFilter : undefined,
        dispatch_id: reportType === 'selling' && dispatchFilter ? dispatchFilter : undefined,
        sales_person: reportType === 'selling' && salesPersonFilter !== 'ALL' ? salesPersonFilter : undefined,
      });
      return res || { rows: [], summary: {}, categories: [], uoms: [], vendors: [], customers: [], sales_persons: [] };
    },
    staleTime: 30 * 1000,
  });

  const rawRows = data?.rows || [];
  const categoryOptions = data?.categories || [{ value: 'ALL', label: 'All Categories' }];
  const uomOptions = data?.uoms || [{ value: 'ALL', label: 'All UOMs' }];
  const vendorOptions = data?.vendors || [{ value: 'ALL', label: 'All Vendors' }];
  const customerOptions = data?.customers || [{ value: 'ALL', label: 'All Customers' }];
  const salesPersonOptions = data?.sales_persons || [{ value: 'ALL', label: 'All Sales Persons' }];

  // Client-side quick filter
  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return rawRows;
    const q = searchQuery.toLowerCase().trim();
    return rawRows.filter((r) =>
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.product_code || '').toLowerCase().includes(q) ||
      (r.vendor_name || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.purchase_entry_id || '').toLowerCase().includes(q) ||
      (r.sales_order_id || '').toLowerCase().includes(q) ||
      (r.dispatch_id || '').toLowerCase().includes(q)
    );
  }, [rawRows, searchQuery]);

  // Client-side sorting
  const sortedRows = useMemo(() => {
    const list = [...searchedRows];
    list.sort((a, b) => {
      let valA, valB;
      if (orderBy === 'product_name') {
        valA = (a.product_name || '').toLowerCase();
        valB = (b.product_name || '').toLowerCase();
      } else if (orderBy === 'last_date') {
        valA = reportType === 'purchase' ? (a.last_purchase_date || '') : (a.last_selling_date || '');
        valB = reportType === 'purchase' ? (b.last_purchase_date || '') : (b.last_selling_date || '');
      } else if (orderBy === 'last_rate') {
        valA = Number(reportType === 'purchase' ? a.last_purchase_rate : a.last_selling_rate) || 0;
        valB = Number(reportType === 'purchase' ? b.last_purchase_rate : b.last_selling_rate) || 0;
      } else if (orderBy === 'min_rate') {
        valA = Number(reportType === 'purchase' ? a.min_purchase_rate : a.min_selling_rate) || 0;
        valB = Number(reportType === 'purchase' ? b.min_purchase_rate : b.min_selling_rate) || 0;
      } else if (orderBy === 'max_rate') {
        valA = Number(reportType === 'purchase' ? a.max_purchase_rate : a.max_selling_rate) || 0;
        valB = Number(reportType === 'purchase' ? b.max_purchase_rate : b.max_selling_rate) || 0;
      } else {
        valA = (a[orderBy] || '');
        valB = (b[orderBy] || '');
      }

      if (valA < valB) return orderDir === 'asc' ? -1 : 1;
      if (valA > valB) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [searchedRows, orderBy, orderDir, reportType]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedRows.slice(start, start + rowsPerPage);
  }, [sortedRows, page, rowsPerPage]);

  // Summary calculation for visible filtered records
  const dynamicSummary = useMemo(() => {
    if (!sortedRows.length) {
      return { total_products: 0, latest_total_value: 0, min_rate: 0, max_rate: 0 };
    }
    let totVal = 0;
    let minR = Infinity;
    let maxR = -Infinity;

    sortedRows.forEach((r) => {
      const v = Number(r.latest_value) || 0;
      totVal += v;
      const minVal = Number(reportType === 'purchase' ? r.min_purchase_rate : r.min_selling_rate) || 0;
      const maxVal = Number(reportType === 'purchase' ? r.max_purchase_rate : r.max_selling_rate) || 0;
      if (minVal < minR) minR = minVal;
      if (maxVal > maxR) maxR = maxVal;
    });

    return {
      total_products: sortedRows.length,
      latest_total_value: totVal,
      min_rate: minR === Infinity ? 0 : minR,
      max_rate: maxR === -Infinity ? 0 : maxR,
    };
  }, [sortedRows, reportType]);

  const handleSort = (field) => {
    if (orderBy === field) {
      setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(field);
      setOrderDir('asc');
    }
    setPage(0);
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setProductNameFilter('');
    setProductCodeFilter('');
    setCategoryFilter('ALL');
    setUomFilter('ALL');
    setVendorFilter('ALL');
    setPurchaseEntryFilter('');
    setCustomerFilter('ALL');
    setSalesOrderFilter('');
    setDispatchFilter('');
    setSalesPersonFilter('ALL');
    setSearchQuery('');
    setPage(0);
  };

  // Export to CSV / Excel
  const exportCsv = () => {
    if (!sortedRows.length) return;
    const isPurchase = reportType === 'purchase';

    const headers = isPurchase
      ? [
        'Product Name',
        
        'Vendor Name',
        'Last Purchase Date',
        'Purchase Entry Number',
        'Purchase Quantity',
        'Last Purchase Rate (INR)',
        'Minimum Purchase Rate (INR)',
        'Maximum Purchase Rate (INR)',
        'Purchase Unit',
        'Currency',
      ]
      : [
        'Product Name',
        
        'Customer Name',
        'Last Selling Date',
        'Sales Order Number',
        'Dispatch Number',
        'Sold Quantity',
        'Last Selling Rate (INR)',
        'Minimum Selling Rate (INR)',
        'Maximum Selling Rate (INR)',
        'Selling Unit',
      ];

    const csvRows = sortedRows.map((r) => {
      if (isPurchase) {
        return [
          `"${(r.product_name || '').replace(/"/g, '""')}"`,
          `"${r.product_code || ''}"`,
          `"${(r.vendor_name || '').replace(/"/g, '""')}"`,
          `"${r.last_purchase_date || ''}"`,
          `"${r.purchase_entry_id || ''}"`,
          r.purchase_qty ?? 0,
          r.last_purchase_rate ?? 0,
          r.min_purchase_rate ?? 0,
          r.max_purchase_rate ?? 0,
          `"${r.purchase_uom || ''}"`,
          `"${r.currency || 'INR'}"`,
        ];
      } else {
        return [
          `"${(r.product_name || '').replace(/"/g, '""')}"`,
          `"${r.product_code || ''}"`,
          `"${(r.customer_name || '').replace(/"/g, '""')}"`,
          `"${r.last_selling_date || ''}"`,
          `"${r.sales_order_id || ''}"`,
          `"${r.dispatch_id || ''}"`,
          r.sold_qty ?? 0,
          r.last_selling_rate ?? 0,
          r.min_selling_rate ?? 0,
          r.max_selling_rate ?? 0,
          `"${r.selling_uom || ''}"`,
        ];
      }
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `${isPurchase ? 'Purchase' : 'Selling'}_Price_Analysis_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPurchase = reportType === 'purchase';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Page Title & View Switcher */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
            Purchase & Selling Price Analysis
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Analyze latest, minimum, and maximum rates across procurement and customer dispatch transactions.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* Report Type Selector */}
          <ToggleButtonGroup
            value={reportType}
            exclusive
            onChange={handleReportTypeChange}
            size="small"
            sx={{
              bgcolor: '#ffffff',
              borderRadius: '8px',
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                px: 2,
                fontSize: '0.82rem',
                '&.Mui-selected': {
                  bgcolor: palette.teal,
                  color: '#ffffff',
                  '&:hover': { bgcolor: '#1e5956ff' },
                },
              },
            }}
          >
            <ToggleButton value="purchase">
              <ShoppingCartOutlined sx={{ fontSize: 18, mr: 1 }} />
              Purchase Wise
            </ToggleButton>
            <ToggleButton value="selling">
              <StorefrontOutlined sx={{ fontSize: 18, mr: 1 }} />
              Selling Wise
            </ToggleButton>
          </ToggleButtonGroup>

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
            onClick={exportCsv}
            disabled={!sortedRows.length}
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

      {/* Filter Section */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '12px', mb: 3, bgcolor: '#ffffff' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <FilterListRounded sx={{ color: palette.teal, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
            {isPurchase ? 'Purchase Wise Filters' : 'Selling Wise Filters'}
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
              lg: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {/* Common 1: From Date */}
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

          {/* Common 2: To Date */}
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

          {/* Common 3: Product Name */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Product Name
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Search product..."
              value={productNameFilter}
              onChange={(e) => {
                setProductNameFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          


          

          {/* Purchase Wise Additional Filter: Vendor */}
          {isPurchase && (
            <FormControl size="small" fullWidth>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                Vendor
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
          )}

        
          {/* Selling Wise Additional Filter: Customer */}
          {!isPurchase && (
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
          )}

          {/* Selling Wise Additional Filter: Sales Order Number */}
          {!isPurchase && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
                Sales Order Number
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g. SO-00112"
                value={salesOrderFilter}
                onChange={(e) => {
                  setSalesOrderFilter(e.target.value);
                  setPage(0);
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          )}

          {/* Selling Wise Additional Filter: Dispatch Number */}
          {!isPurchase && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
                Dispatch Number
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g. DSP-00113"
                value={dispatchFilter}
                onChange={(e) => {
                  setDispatchFilter(e.target.value);
                  setPage(0);
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          )}

          {/* Selling Wise Additional Filter: Sales Person */}
          {!isPurchase && (
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
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Quick Search */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
          <TextField
            size="small"
            placeholder={isPurchase ? "Search by Product, Vendor, Entry ID..." : "Search by Product, Customer, SO, Dispatch..."}
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
            sx={{ width: { xs: '100%', sm: 360 }, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Showing <b>{sortedRows.length}</b> product(s) in {isPurchase ? 'Purchase' : 'Selling'} view
          </Typography>
        </Stack>
      </Paper>

      {/* Summary KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label={isPurchase ? 'Total Products Purchased' : 'Total Products Sold'}
          value={dynamicSummary.total_products}
          subtitle="Distinct active products"
          icon={isPurchase ? ShoppingCartOutlined : StorefrontOutlined}
          iconBg="rgba(59, 130, 246, 0.1)"
          iconColor="#2563eb"
        />
        <StatCard
          label={isPurchase ? 'Latest Purchase Value' : 'Latest Selling Value'}
          value={`₹${fmtNum(dynamicSummary.latest_total_value, 2)}`}
          subtitle="Latest qty × latest rate"
          icon={PriceChangeOutlined}
          iconBg="rgba(14, 42, 47, 0.1)"
          iconColor={palette.teal}
        />
        <StatCard
          label={isPurchase ? 'Minimum Purchase Rate' : 'Minimum Selling Rate'}
          value={`₹${fmtNum(dynamicSummary.min_rate, 2)}`}
          subtitle="Lowest in selected range"
          icon={TrendingDownRounded}
          iconBg="rgba(16, 185, 129, 0.1)"
          iconColor="#059669"
        />
        <StatCard
          label={isPurchase ? 'Maximum Purchase Rate' : 'Maximum Selling Rate'}
          value={`₹${fmtNum(dynamicSummary.max_rate, 2)}`}
          subtitle="Highest in selected range"
          icon={TrendingUpRounded}
          iconBg="rgba(245, 158, 11, 0.1)"
          iconColor="#d97706"
        />
      </Box>

      {/* Data Table */}
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

                {/* Sortable Product Name */}
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'product_name'}
                    direction={orderBy === 'product_name' ? orderDir : 'asc'}
                    onClick={() => handleSort('product_name')}
                  >
                    Product
                  </TableSortLabel>
                </TableCell>

                <TableCell>Product Code</TableCell>

                {/* Purchase Wise vs Selling Wise specific columns */}
                {isPurchase ? (
                  <>
                    <TableCell>Vendor</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === 'last_date'}
                        direction={orderBy === 'last_date' ? orderDir : 'asc'}
                        onClick={() => handleSort('last_date')}
                      >
                        Last Pur. Dt
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>PE No</TableCell>
                    <TableCell align="right">Purchase Qty</TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'last_rate'}
                        direction={orderBy === 'last_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('last_rate')}
                      >
                        Last Purchase Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'min_rate'}
                        direction={orderBy === 'min_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('min_rate')}
                      >
                        Min Purchase Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'max_rate'}
                        direction={orderBy === 'max_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('max_rate')}
                      >
                        Max Purchase Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Pur. Unit</TableCell>
                    <TableCell>Pur. Currency</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Customer</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === 'last_date'}
                        direction={orderBy === 'last_date' ? orderDir : 'asc'}
                        onClick={() => handleSort('last_date')}
                      >
                        Last Selling Dt
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Sales Order No</TableCell>
                    <TableCell>Dispatch No</TableCell>
                    <TableCell align="right">Sold Qty</TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'last_rate'}
                        direction={orderBy === 'last_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('last_rate')}
                      >
                        Last Selling Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'min_rate'}
                        direction={orderBy === 'min_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('min_rate')}
                      >
                        Min Selling Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={orderBy === 'max_rate'}
                        direction={orderBy === 'max_rate' ? orderDir : 'asc'}
                        onClick={() => handleSort('max_rate')}
                      >
                        Max Selling Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Selling Unit</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isPurchase ? 12 : 12 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={isPurchase ? 12 : 12} align="center" sx={{ py: 6 }}>
                    <Typography color="error" variant="body2">
                      Failed to load Price Analysis: {error?.message || 'Unknown error'}
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => refetch()} sx={{ mt: 1.5, borderRadius: '6px' }}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isPurchase ? 12 : 12} align="center" sx={{ py: 8 }}>
                    <Box sx={{ color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineRounded sx={{ fontSize: 44, color: '#94a3b8' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#334155' }}>
                        No Transactions Found
                      </Typography>
                      <Typography variant="body2" sx={{ maxWidth: 450, color: 'text.secondary' }}>
                        No {isPurchase ? 'purchase entries' : 'confirmed dispatches'} match the chosen date range and filter criteria.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => {
                  return (
                    <TableRow key={`${row.product_code}-${idx}`} hover>
                      <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.78rem', px: 1 }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem', px: 1, minWidth: 160 }}>
                        {row.product_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', px: 1, fontFamily: 'monospace' }}>
                        {row.product_code}
                      </TableCell>

                      {isPurchase ? (
                        <>
                          <TableCell sx={{ fontWeight: 500, fontSize: '0.82rem', px: 1 }}>
                            {row.vendor_name}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', px: 1 }}>
                            {fmtDate(row.last_purchase_date)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, color: palette.teal, fontSize: '0.8rem', px: 1 }}>
                            {row.purchase_entry_id}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem', px: 1 }}>
                            {fmtNum(row.purchase_qty, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.85rem', px: 1, color: '#0f172a' }}>
                            ₹{fmtNum(row.last_purchase_rate, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, color: '#059669', fontWeight: 600 }}>
                            ₹{fmtNum(row.min_purchase_rate, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, color: '#ea580c', fontWeight: 600 }}>
                            ₹{fmtNum(row.max_purchase_rate, 2)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', px: 1 }}>
                            {row.purchase_uom}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', px: 1, color: 'text.secondary' }}>
                            {row.currency || '₹'}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell sx={{ fontWeight: 500, fontSize: '0.82rem', px: 1 }}>
                            {row.customer_name}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', px: 1 }}>
                            {fmtDate(row.last_selling_date)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', px: 1, color: palette.teal, fontWeight: 600 }}>
                            {row.sales_order_id || '-'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', px: 1, fontWeight: 600 }}>
                            {row.dispatch_id}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.82rem', px: 1 }}>
                            {fmtNum(row.sold_qty, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.85rem', px: 1, color: '#0f172a' }}>
                            ₹{fmtNum(row.last_selling_rate, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, color: '#059669', fontWeight: 600 }}>
                            ₹{fmtNum(row.min_selling_rate, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.82rem', px: 1, color: '#ea580c', fontWeight: 600 }}>
                            ₹{fmtNum(row.max_selling_rate, 2)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem', px: 1 }}>
                            {row.selling_uom}
                          </TableCell>
                        </>
                      )}
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
          count={sortedRows.length}
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

