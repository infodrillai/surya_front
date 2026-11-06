import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useQuery } from '@tanstack/react-query';
import { getList } from '../api/client';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';

const REPORT_TABS = [
  '1. Date-wise Production',
  '2. Product-wise Production',
  '3. Material Consumption',
  '4. Roll Consumption',
  '5. Rejection & Wastage',
  '6. Manufacturing Cost',
];

export default function BeltProductionReportPage() {
  const [tab, setTab] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Fetch Belt Batches
  const { data: rawBatches = [], refetch, isFetching } = useQuery({
    queryKey: ['belt_report_batches'],
    queryFn: () => getList('Belt Batch').catch(() => []),
  });

  // Filter batches
  const batches = useMemo(() => {
    return rawBatches.filter((b) => {
      if (fromDate && b.posting_date && b.posting_date < fromDate) return false;
      if (toDate && b.posting_date && b.posting_date > toDate) return false;
      if (selectedProduct && b.product !== selectedProduct) return false;
      return true;
    });
  }, [rawBatches, fromDate, toDate, selectedProduct]);

  // Unique products for filter dropdown
  const uniqueProducts = useMemo(() => {
    return [...new Set(rawBatches.map((b) => b.product).filter(Boolean))];
  }, [rawBatches]);

  // Overall totals
  const summaryTotals = useMemo(() => {
    let planned = 0;
    let actual = 0;
    let accepted = 0;
    let rejected = 0;
    let rollConsumed = 0;
    let rollRemaining = 0;
    let materialCost = 0;
    let charges = 0;
    let totalCost = 0;

    batches.forEach((b) => {
      planned += Number(b.planned_quantity || 0);
      actual += Number(b.actual_quantity || b.planned_quantity || 0);
      accepted += Number(b.accepted_quantity || b.planned_quantity || 0);
      rejected += Number(b.rejected_quantity || 0);
      rollConsumed += Number(b.roll_consumed || b.roll_required || 0);
      rollRemaining += Number(b.remaining_roll || 0);
      materialCost += Number(b.carried_cost || 0) + Number(b.added_cost || 0);
      charges += Number(b.charge_total || 0);
      totalCost += Number(b.batch_total || 0);
    });

    const avgUnitCost = accepted > 0 ? totalCost / accepted : 0;

    return {
      planned,
      actual,
      accepted,
      rejected,
      rollConsumed,
      rollRemaining,
      materialCost,
      charges,
      totalCost,
      avgUnitCost,
    };
  }, [batches]);

  // Export table as CSV
  const exportCSV = () => {
    const rows = [
      ['Batch No', 'Date', 'Product', 'Belt Type', 'Planned Qty', 'Actual Qty', 'Accepted Qty', 'Rejected Qty', 'Roll Consumed (m)', 'Material Cost', 'Charges', 'Total Cost', 'Cost/Pc', 'Status'],
      ...batches.map((b) => [
        b.name,
        b.posting_date,
        b.product,
        b.belt_type,
        b.planned_quantity,
        b.actual_quantity || b.planned_quantity,
        b.accepted_quantity || b.planned_quantity,
        b.rejected_quantity || 0,
        b.roll_consumed || b.roll_required,
        b.carried_cost || 0,
        b.charge_total || 0,
        b.batch_total || 0,
        b.unit_cost || 0,
        b.status,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Belt_Production_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* Title & Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
            Belt Manufacturing Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Process-wise analysis, roll consumption tracking, rejection breakdown, and manufacturing cost audit.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadRoundedIcon />}
            onClick={exportCSV}
            sx={{ bgcolor: '#0284c7' }}
          >
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Accepted Output
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#16a34a', mt: 0.5 }}>
            {fmtNum(summaryTotals.accepted)} PCS
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Total Roll Consumed
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0284c7', mt: 0.5 }}>
            {fmtNum(summaryTotals.rollConsumed, 1)} m
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Total Rejections
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#dc2626', mt: 0.5 }}>
            {fmtNum(summaryTotals.rejected)} PCS
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Total Cost
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
            {fmtMoney(summaryTotals.totalCost)}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: '#15803d', textTransform: 'uppercase' }}>
            Avg Cost / Accepted Pc
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d', mt: 0.5 }}>
            {fmtMoney(summaryTotals.avgUnitCost)}
          </Typography>
        </Paper>
      </Box>

      {/* Filter Bar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2, bgcolor: '#ffffff' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            label="From Date"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
          <TextField
            label="To Date"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Filter Belt Product</InputLabel>
            <Select
              value={selectedProduct}
              label="Filter Belt Product"
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <MenuItem value="">All Belt Products</MenuItem>
              {uniqueProducts.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {(fromDate || toDate || selectedProduct) && (
            <Button
              size="small"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setSelectedProduct('');
              }}
            >
              Reset
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Report Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        {REPORT_TABS.map((t) => (
          <Tab key={t} label={t} sx={{ fontWeight: 600, minHeight: 44 }} />
        ))}
      </Tabs>

      {/* Report Content Table */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Batch No</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Belt Type</TableCell>

                {/* Tab specific columns */}
                {tab === 0 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Planned (PCS)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Accepted (PCS)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Status</TableCell>
                  </>
                )}

                {tab === 1 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Dimensions (L×W)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Total Produced</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Accepted</TableCell>
                  </>
                )}

                {tab === 2 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Roll Consumed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Material Cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Process Charges</TableCell>
                  </>
                )}

                {tab === 3 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Roll Req (m)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Roll Consumed (m)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Remaining Roll (m)</TableCell>
                  </>
                )}

                {tab === 4 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Planned</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Accepted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Rejected</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Rejection %</TableCell>
                  </>
                )}

                {tab === 5 && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Material Cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Charges</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Total Cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Cost / Accepted Pc</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {batches.map((b, idx) => (
                <TableRow key={b.name || idx} hover>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#0369a1' }}>{b.name}</TableCell>
                  <TableCell>{fmtDate(b.posting_date)}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{b.product}</TableCell>
                  <TableCell>{b.belt_type || 'Standard'}</TableCell>

                  {tab === 0 && (
                    <>
                      <TableCell align="right">{fmtNum(b.planned_quantity)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a' }}>
                        {fmtNum(b.accepted_quantity || b.planned_quantity)}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={b.status || 'Draft'}
                          color={b.status === 'Completed' ? 'success' : 'default'}
                        />
                      </TableCell>
                    </>
                  )}

                  {tab === 1 && (
                    <>
                      <TableCell align="right">{b.length} × {b.width} mm</TableCell>
                      <TableCell align="right">{fmtNum(b.actual_quantity || b.planned_quantity)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a' }}>
                        {fmtNum(b.accepted_quantity || b.planned_quantity)}
                      </TableCell>
                    </>
                  )}

                  {tab === 2 && (
                    <>
                      <TableCell align="right">{fmtNum(b.roll_consumed || b.roll_required, 2)} m</TableCell>
                      <TableCell align="right">{fmtMoney(b.carried_cost || 0)}</TableCell>
                      <TableCell align="right">{fmtMoney(b.charge_total || 0)}</TableCell>
                    </>
                  )}

                  {tab === 3 && (
                    <>
                      <TableCell align="right">{fmtNum(b.roll_required, 2)} m</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#0369a1' }}>
                        {fmtNum(b.roll_consumed || b.roll_required, 2)} m
                      </TableCell>
                      <TableCell align="right">{fmtNum(b.remaining_roll || 0, 2)} m</TableCell>
                    </>
                  )}

                  {tab === 4 && (
                    <>
                      <TableCell align="right">{fmtNum(b.planned_quantity)}</TableCell>
                      <TableCell align="right" sx={{ color: '#16a34a', fontWeight: 600 }}>
                        {fmtNum(b.accepted_quantity || b.planned_quantity)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 700 }}>
                        {fmtNum(b.rejected_quantity || 0)}
                      </TableCell>
                      <TableCell align="right">{b.rejection_percent || 0}%</TableCell>
                    </>
                  )}

                  {tab === 5 && (
                    <>
                      <TableCell align="right">{fmtMoney(b.carried_cost || 0)}</TableCell>
                      <TableCell align="right">{fmtMoney(b.charge_total || 0)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(b.batch_total || 0)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a' }}>
                        {fmtMoney(b.unit_cost || 0)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}

              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No belt batches match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

