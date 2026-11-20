import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  FilterListRounded,
  Inventory2Outlined,
  PriceCheckOutlined,
  ProductionQuantityLimitsOutlined,
  RefreshRounded,
  RestartAltRounded,
  SearchRounded,
  StorefrontOutlined,
  WarehouseOutlined,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../api/client';
import { fmtMoney, fmtNum } from '../../lib/format';
import { palette } from '../../theme';
import { useAuthStore } from '../../stores/authStore';

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

export default function StorePage() {
  const { isAdmin, isSalesPerson } = useAuthStore();

  // Filters
  const [productNameFilter, setProductNameFilter] = useState('');
  const [productCodeFilter, setProductCodeFilter] = useState('');
  const [productionCodeFilter, setProductionCodeFilter] = useState('');
  const [companyCodeFilter, setCompanyCodeFilter] = useState('');
  const [competitorCompanyCodeFilter, setCompetitorCompanyCodeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch Finished Goods Store inventory from backend
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'storeInventory',
      productNameFilter,
      productCodeFilter,
      productionCodeFilter,
      companyCodeFilter,
      competitorCompanyCodeFilter,
      searchQuery,
    ],
    queryFn: async () => {
      const res = await call('clssurya.api.get_store_inventory', {
        search: searchQuery.trim() || undefined,
        product_name: productNameFilter.trim() || undefined,
        product_code: productCodeFilter.trim() || undefined,
        production_code: productionCodeFilter.trim() || undefined,
        company_code: companyCodeFilter.trim() || undefined,
        competitor_company_code: competitorCompanyCodeFilter.trim() || undefined,
      });
      return res || { rows: [], summary: {} };
    },
    staleTime: 15 * 1000,
  });

  const rawRows = data?.rows || [];

  // Client-side quick filter
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rawRows;
    const q = searchQuery.toLowerCase().trim();
    return rawRows.filter(
      (r) =>
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.product_code || '').toLowerCase().includes(q) ||
        (r.production_code || '').toLowerCase().includes(q) ||
        (r.company_code || '').toLowerCase().includes(q) ||
        (r.competitor_company_code || '').toLowerCase().includes(q)
    );
  }, [rawRows, searchQuery]);

  // Dynamic summary
  const summary = useMemo(() => {
    let totQty = 0;
    let totVal = 0;

    filteredRows.forEach((r) => {
      const qty = Number(r.available_quantity) || 0;
      const cost = Number(r.product_cost) || 0;
      totQty += qty;
      totVal += Number(r.total_amount) || qty * cost;
    });

    return {
      total_products: filteredRows.length,
      total_quantity: totQty,
      total_value: totVal,
      avg_unit_cost: totQty > 0 ? totVal / totQty : 0,
    };
  }, [filteredRows]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const handleResetFilters = () => {
    setProductNameFilter('');
    setProductCodeFilter('');
    setProductionCodeFilter('');
    setCompanyCodeFilter('');
    setCompetitorCompanyCodeFilter('');
    setSearchQuery('');
    setPage(0);
  };

  // Export CSV
  const exportCsv = () => {
    if (!filteredRows.length) return;
    const headers = [
      '#',
      'Product Name',
      'Product Code',
      'Production Code',
      'Competitor Company Code',
      'Company Code',
      'Product Cost (Per Unit)',
      'UOM',
      'Available Quantity',
      'Total Value (INR)',
    ];

    const csvRows = filteredRows.map((r, i) => [
      i + 1,
      `"${(r.product_name || '').replace(/"/g, '""')}"`,
      `"${(r.product_code || '').replace(/"/g, '""')}"`,
      `"${(r.production_code || '').replace(/"/g, '""')}"`,
      `"${(r.competitor_company_code || '').replace(/"/g, '""')}"`,
      `"${(r.company_code || '').replace(/"/g, '""')}"`,
      r.product_cost ?? 0,
      `"${r.product_uom || 'PCS'}"`,
      r.available_quantity ?? 0,
      r.total_amount ?? (Number(r.available_quantity) * Number(r.product_cost) || 0),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Store_Finished_Goods_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto', pb: 6 }}>
      {/* Page Title & Actions */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <StorefrontOutlined sx={{ fontSize: 28, color: palette.teal }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
              Store
            </Typography>
            <Chip
              size="small"
              label={isAdmin ? 'Finished Goods Management' : 'Finished Goods (Read-Only)'}
              sx={{
                bgcolor: isAdmin ? 'rgba(15, 118, 110, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                color: isAdmin ? palette.teal : '#475569',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Real-time finished goods stock, unit production costs, and code mappings across all finished products.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
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

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Available Products"
          value={summary.total_products}
          subtitle="Products with on-hand FG stock"
          icon={Inventory2Outlined}
          iconBg="rgba(59, 130, 246, 0.1)"
          iconColor="#2563eb"
        />
        <StatCard
          label="Total Available Quantity"
          value={fmtNum(summary.total_quantity, 2)}
          subtitle="Net of confirmed dispatches"
          icon={WarehouseOutlined}
          iconBg="rgba(16, 185, 129, 0.1)"
          iconColor="#059669"
        />
        <StatCard
          label="Total Inventory Value"
          value={`₹${fmtNum(summary.total_value, 2)}`}
          subtitle="Weighted production valuation"
          icon={PriceCheckOutlined}
          iconBg="rgba(14, 42, 47, 0.1)"
          iconColor={palette.teal}
        />
        
      </Box>

      {/* Filter Section */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '12px', mb: 3, bgcolor: '#ffffff' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <FilterListRounded sx={{ color: palette.teal, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Store Filters
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
          {/* 1. Product Name */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Product Name
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter by product name..."
              value={productNameFilter}
              onChange={(e) => {
                setProductNameFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 2. Product Code */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Product Code
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter by product code..."
              value={productCodeFilter}
              onChange={(e) => {
                setProductCodeFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 3. Production Code */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Production Code
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter by production code..."
              value={productionCodeFilter}
              onChange={(e) => {
                setProductionCodeFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 4. Company Code */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Company Code
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter by company code..."
              value={companyCodeFilter}
              onChange={(e) => {
                setCompanyCodeFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* 5. Competitor Company Code */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Competitor Company Code
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter by competitor code..."
              value={competitorCompanyCodeFilter}
              onChange={(e) => {
                setCompetitorCompanyCodeFilter(e.target.value);
                setPage(0);
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <TextField
            size="small"
            placeholder="Quick search across all fields..."
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
            sx={{ width: { xs: '100%', sm: 350 }, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>
      </Paper>

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
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <TableCell width={45} align="center">#</TableCell>
                <TableCell>Product Name</TableCell>
                <TableCell>Product Code</TableCell>
                <TableCell>Production Code</TableCell>
                <TableCell>Competitor Company Code</TableCell>
                <TableCell>Company Code</TableCell>
                <TableCell align="right">Cost (Per Unit)</TableCell>
                <TableCell align="center">UOM</TableCell>
                <TableCell align="right">Available Quantity</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography color="error" variant="body2">
                      Failed to load Store inventory: {error?.message || 'Unknown error'}
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => refetch()} sx={{ mt: 1.5, borderRadius: '6px' }}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 8 }}>
                    <Box sx={{ color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineRounded sx={{ fontSize: 44, color: '#94a3b8' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#334155' }}>
                        No Finished Goods in Store
                      </Typography>
                      <Typography variant="body2" sx={{ maxWidth: 480, color: 'text.secondary' }}>
                        Products automatically appear here when transferred from production to Finished Goods. Currently no finished inventory matches the selected criteria.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => (
                  <TableRow key={`${row.product_code || row.product_id}-${idx}`} hover>
                    <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                      {page * rowsPerPage + idx + 1}
                    </TableCell>

                    {/* 1. Product Name */}
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem', minWidth: 160 }}>
                      {row.product_name}
                    </TableCell>

                    {/* 2. Product Code */}
                    <TableCell sx={{ fontWeight: 600, color: palette.teal, fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {row.product_code || row.product_id}
                    </TableCell>

                    {/* 3. Production Code */}
                    <TableCell sx={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {row.production_code ? (
                        <Chip
                          size="small"
                          label={row.production_code}
                          sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: 'rgba(15, 118, 110, 0.08)', color: palette.teal }}
                        />
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>
                      )}
                    </TableCell>

                    {/* 4. Competitor Company Code */}
                    <TableCell sx={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {row.competitor_company_code || '-'}
                    </TableCell>

                    {/* 5. Company Code */}
                    <TableCell sx={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {row.company_code || '-'}
                    </TableCell>

                    {/* 6. Product Cost (Per Unit) */}
                    <TableCell align="right" sx={{ fontSize: '0.82rem' }}>
                      ₹{fmtNum(row.product_cost, 2)}
                    </TableCell>

                    {/* 7. Product UOM */}
                    <TableCell align="center" sx={{ fontSize: '0.82rem' }}>
                      <Chip
                        size="small"
                        label={row.product_uom || 'PCS'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                      />
                    </TableCell>

                    {/* 8. Available Quantity */}
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: '#059669',
                      }}
                    >
                      {fmtNum(row.available_quantity, 2)} {row.product_uom || 'PCS'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>

            {/* Totals Footer */}
            {filteredRows.length > 0 && (
              <TableFooter>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.82rem', py: 1.5 } }}>
                  <TableCell colSpan={7} align="right">
                    Total Finished Goods Stock:
                  </TableCell>
                  
                  <TableCell />
                  <TableCell align="right" sx={{ color: '#059669', fontSize: '0.88rem' }}>
                    {fmtNum(summary.total_quantity, 2)}
                  </TableCell>
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

