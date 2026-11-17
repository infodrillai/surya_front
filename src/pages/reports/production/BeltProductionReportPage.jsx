import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tab,
  Tabs,
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
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery } from '@tanstack/react-query';
import { call, getList } from '../../../api/client';
import { fmtDate, fmtMoney, fmtNum } from '../../../lib/format';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatchDetail, setSelectedBatchDetail] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch Belt Production Report from dedicated Server API
  const {
    data: reportData,
    refetch,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ['belt_production_report', fromDate, toDate, selectedProduct],
    queryFn: async () => {
      try {
        const res = await call('clssurya.api.get_belt_production_report', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          product: selectedProduct || undefined,
        });
        if (res && res.success) {
          return res;
        }
      } catch (err) {
        console.warn('Backend get_belt_production_report call failed, falling back to local query:', err);
      }

      // Fallback: Local assembly from Belt Batch list
      const rawBatches = await getList('Belt Batch', { limit: 1000 }).catch(() => []);
      const cleanBatches = (rawBatches || []).map((b) => {
        const qty = Number(b.quantity || 0);
        const stg = Number(b.process_step || b.stage || 1);
        const wastage = Number(b.wastage_qty || 0);
        const rejPct = Number(b.rejection_percent || 0);
        const rejQty = wastage > 0 ? wastage : (rejPct > 0 ? (qty * rejPct) / 100 : 0);
        const accQty = Math.max(0, qty - rejQty);
        const length = Number(b.length || 0);
        const width = Number(b.width || 0);
        const factor = Number(b.roll_division_factor || (width <= 100 ? 3 : 2)) || 1;
        const rollReq = length > 0 && qty > 0 ? (length / 1000 * qty) / factor : Number(b.roll_required || 0);
        const rollCons = Number(b.roll_consumed || rollReq);
        const rollWaste = Math.max(0, rollCons - rollReq);
        const totalCost = Number(b.batch_total || 0);
        const unitCost = Number(b.unit_cost || (accQty > 0 ? totalCost / accQty : 0));

        return {
          name: b.name,
          posting_date: b.posting_date,
          product: b.product,
          belt_type: b.belt_type || 'Standard',
          stage: stg,
          stage_name: b.current_process || (stg === 1 ? 'Stage 1: Roll Creation' : stg === 2 ? 'Stage 2: Belt Sizing' : stg === 3 ? 'Stage 3: Belt Finishing' : 'Stage 4: Charges'),
          status: b.is_completed ? 'Completed' : 'In Progress',
          is_completed: b.is_completed ? 1 : 0,
          planned_quantity: qty,
          produced_quantity: qty,
          accepted_quantity: accQty,
          rejected_quantity: rejQty,
          rejection_percent: rejPct,
          wastage_qty: wastage,
          rejection_amount: Number(b.rejection_amount || 0),
          length,
          width,
          holes: Number(b.holes || 0),
          roll_division_factor: factor,
          roll_required: rollReq,
          roll_consumed: rollCons,
          roll_wastage: rollWaste,
          remaining_roll: Number(b.remaining_roll || 0),
          carried_cost: Number(b.carried_cost || 0),
          added_cost: Number(b.added_cost || 0),
          charge_total: Number(b.charge_total || 0),
          batch_total: totalCost,
          unit_cost: unitCost,
          items: [],
          charges: [],
        };
      });

      return {
        success: true,
        batches: cleanBatches,
        product_summary: [],
        date_summary: [],
        material_consumption: [],
        roll_consumption: { summary: {}, batches: cleanBatches },
        rejection_summary: { batches: cleanBatches },
        cost_summary: { batches: cleanBatches },
        summary: {},
      };
    },
    staleTime: 30000,
  });

  const allBatches = useMemo(() => reportData?.batches || [], [reportData]);

  // Unique products for filter dropdown
  const uniqueProducts = useMemo(() => {
    return [...new Set(allBatches.map((b) => b.product).filter(Boolean))];
  }, [allBatches]);

  // Filtered batches by text search
  const filteredBatches = useMemo(() => {
    return allBatches.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const p = (b.product || '').toLowerCase();
        const n = (b.name || '').toLowerCase();
        const s = (b.stage_name || '').toLowerCase();
        if (!p.includes(q) && !n.includes(q) && !s.includes(q)) return false;
      }
      return true;
    });
  }, [allBatches, searchQuery]);

  // KPI calculations
  const kpis = useMemo(() => {
    if (reportData?.summary && reportData.summary.total_batches > 0) {
      return {
        totalBatches: reportData.summary.total_batches,
        totalPlanned: reportData.summary.total_planned,
        totalProduced: reportData.summary.total_produced,
        totalAccepted: reportData.summary.total_accepted,
        totalRejected: reportData.summary.total_rejected,
        rejectionRate: (reportData.summary.total_rejected / (reportData.summary.total_produced || 1)) * 100,
        totalRollConsumed: reportData.roll_consumption?.summary?.total_roll_consumed || 0,
        totalRollProduced: reportData.roll_consumption?.summary?.total_roll_produced || 0,
        availableRollBalance: reportData.roll_consumption?.summary?.available_roll_balance || 0,
        totalRollWastage: reportData.roll_consumption?.summary?.total_roll_wastage || 0,
        totalCost: reportData.summary.total_cost,
        avgUnitCost: reportData.summary.avg_unit_cost,
      };
    }

    // Client calculation
    let totalPlanned = 0, totalProduced = 0, totalAccepted = 0, totalRejected = 0, totalRollConsumed = 0, totalCost = 0;
    filteredBatches.forEach((b) => {
      totalPlanned += Number(b.planned_quantity || 0);
      totalProduced += Number(b.produced_quantity || 0);
      totalAccepted += Number(b.accepted_quantity || 0);
      totalRejected += Number(b.rejected_quantity || 0);
      totalRollConsumed += Number(b.roll_consumed || 0);
      totalCost += Number(b.batch_total || 0);
    });

    return {
      totalBatches: filteredBatches.length,
      totalPlanned,
      totalProduced,
      totalAccepted,
      totalRejected,
      rejectionRate: totalProduced > 0 ? (totalRejected / totalProduced) * 100 : 0,
      totalRollConsumed,
      totalRollProduced: 0,
      availableRollBalance: 0,
      totalRollWastage: 0,
      totalCost,
      avgUnitCost: totalAccepted > 0 ? totalCost / totalAccepted : 0,
    };
  }, [reportData, filteredBatches]);

  // Material consumption list
  const materialConsumptionList = useMemo(() => {
    return reportData?.material_consumption || [];
  }, [reportData]);

  // Product summary list
  const productSummaryList = useMemo(() => {
    return reportData?.product_summary || [];
  }, [reportData]);

  // Date summary list
  const dateSummaryList = useMemo(() => {
    return reportData?.date_summary || [];
  }, [reportData]);

  // Roll consumption summary
  const rollSummary = useMemo(() => {
    return reportData?.roll_consumption?.summary || {
      total_roll_produced: 0,
      total_roll_consumed: 0,
      total_roll_required: 0,
      total_roll_wastage: 0,
      available_roll_balance: 0,
    };
  }, [reportData]);

  // Export table as CSV based on active tab
  const exportCSV = () => {
    let rows = [];
    let filename = `Belt_Production_Report_${new Date().toISOString().split('T')[0]}.csv`;

    if (tab === 0) {
      // Date-wise
      rows = [
        ['#', 'Batch No', 'Posting Date', 'Product', 'Stage', 'Belt Type', 'Planned Qty', 'Produced Qty', 'Accepted Qty', 'Rejected Qty', 'Total Cost (INR)', 'Status'],
        ...filteredBatches.map((b, i) => [
          i + 1,
          b.name,
          b.posting_date,
          `"${b.product}"`,
          `"${b.stage_name}"`,
          b.belt_type,
          b.planned_quantity,
          b.produced_quantity,
          b.accepted_quantity,
          b.rejected_quantity,
          b.batch_total,
          b.status,
        ]),
      ];
      filename = `Belt_Datewise_Production_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (tab === 1) {
      // Product-wise
      rows = [
        ['#', 'Product', 'Belt Type', 'Dimensions', 'Stage 1 (Roll)', 'Stage 2 (Sizing)', 'Stage 3 (Finishing)', 'Stage 4 (Charges)', 'Total Produced', 'Total Accepted', 'Total Rejected', 'Total Cost (INR)', 'Avg Cost/Unit (INR)'],
        ...productSummaryList.map((p, i) => [
          i + 1,
          `"${p.product}"`,
          p.belt_type,
          `"${p.dimensions}"`,
          p.stage1_qty,
          p.stage2_qty,
          p.stage3_qty,
          p.stage4_qty,
          p.total_produced,
          p.total_accepted,
          p.total_rejected,
          p.total_cost,
          p.avg_unit_cost,
        ]),
      ];
      filename = `Belt_Productwise_Production_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (tab === 2) {
      // Material consumption
      rows = [
        ['#', 'Material / Raw Product', 'Type', 'Total Consumed Qty', 'Avg Unit Rate (INR)', 'Total Cost (INR)', 'Batches Count'],
        ...materialConsumptionList.map((m, i) => [
          i + 1,
          `"${m.product}"`,
          m.is_intermediate ? 'Intermediate / Semi-Finished' : 'Raw Material',
          m.total_consumed,
          m.avg_rate,
          m.total_cost,
          m.batches_count,
        ]),
      ];
      filename = `Belt_Material_Consumption_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (tab === 3) {
      // Roll consumption
      rows = [
        ['#', 'Batch No', 'Date', 'Product', 'Stage', 'Output Qty', 'Length (mm)', 'Width (mm)', 'Division Factor', 'Roll Required (m)', 'Roll Consumed (m)', 'Roll Wastage (m)', 'Remaining Roll (m)'],
        ...filteredBatches.map((b, i) => [
          i + 1,
          b.name,
          b.posting_date,
          `"${b.product}"`,
          `"${b.stage_name}"`,
          b.produced_quantity,
          b.length,
          b.width,
          b.roll_division_factor,
          b.roll_required,
          b.roll_consumed,
          b.roll_wastage,
          b.remaining_roll,
        ]),
      ];
      filename = `Belt_Roll_Consumption_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (tab === 4) {
      // Rejection & Wastage
      rows = [
        ['#', 'Batch No', 'Date', 'Product', 'Stage', 'Planned Qty', 'Produced Qty', 'Accept Qty', 'Rejected Qty', 'Rejection %', 'Wast.Qty', 'Rejection Amount (INR)', 'Status'],
        ...filteredBatches.map((b, i) => [
          i + 1,
          b.name,
          b.posting_date,
          `"${b.product}"`,
          `"${b.stage_name}"`,
          b.planned_quantity,
          b.produced_quantity,
          b.accepted_quantity,
          b.rejected_quantity,
          b.rejection_percent,
          b.wastage_qty,
          b.rejection_amount,
          b.status,
        ]),
      ];
      filename = `Belt_Rejection_Wastage_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      // Manufacturing Cost
      rows = [
        ['#', 'Batch No', 'Date', 'Product', 'Stage', 'Accepted Qty', 'Carried Cost (INR)', 'Added Cost (INR)', 'Process Charges (INR)', 'Total Batch Cost (INR)', 'Unit Cost / Pc (INR)'],
        ...filteredBatches.map((b, i) => [
          i + 1,
          b.name,
          b.posting_date,
          `"${b.product}"`,
          `"${b.stage_name}"`,
          b.accepted_quantity,
          b.carried_cost,
          b.added_cost,
          b.charge_total,
          b.batch_total,
          b.unit_cost,
        ]),
      ];
      filename = `Belt_Manufacturing_Cost_${new Date().toISOString().split('T')[0]}.csv`;
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Title & Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
            Belt Manufacturing Reports
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Process-wise analysis, roll consumption tracking, raw material utilization, rejection breakdown, and manufacturing cost audit.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={() => refetch()}
            disabled={isFetching}
            sx={{ borderRadius: '8px' }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintRoundedIcon />}
            onClick={handlePrint}
            sx={{ borderRadius: '8px' }}
          >
            Print
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadRoundedIcon />}
            onClick={exportCSV}
            sx={{ bgcolor: '#0284c7', borderRadius: '8px', '&:hover': { bgcolor: '#0369a1' } }}
          >
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#ffffff' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Total Accepted Output
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#16a34a', mt: 0.5 }}>
            {fmtNum(kpis.totalAccepted, 3)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {kpis.totalBatches} batches
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#ffffff' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Roll Consumed
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0284c7', mt: 0.5 }}>
            {fmtNum(kpis.totalRollConsumed, 3)} m
          </Typography>
          <Typography variant="caption" color="text.secondary">
            In sizing operations
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#ffffff' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Roll Balance
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f766e', mt: 0.5 }}>
            {fmtNum(kpis.availableRollBalance, 3)} m
          </Typography>
          <Typography variant="caption" color="text.secondary">
            From {fmtNum(kpis.totalRollProduced, 0)}m produced
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#ffffff' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Rejection & Wastage
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: kpis.totalRejected > 0 ? '#dc2626' : '#64748b', mt: 0.5 }}>
            {fmtNum(kpis.totalRejected, 3)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Rate: {fmtNum(kpis.rejectionRate, 2)}% | Waste: {fmtNum(kpis.totalRollWastage, 2)}m
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#ffffff' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Total Production Cost
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
            {fmtMoney(kpis.totalCost, 2)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Material + Charges
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
            Avg Cost / Accepted Unit
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d', mt: 0.5 }}>
            {fmtMoney(kpis.avgUnitCost, 2)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#16a34a' }}>
            Weighted net average
          </Typography>
        </Paper>
      </Box>

      {/* Filter Bar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: '12px', bgcolor: '#ffffff' }}>
        <Stack spacing={1.5}>
          {/* Quick Date Presets */}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label="This Month"
              size="small"
              onClick={() => {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setFromDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
                setToDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(end.getDate())}`);
              }}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            />
            <Chip
              label="Last 3 Months"
              size="small"
              onClick={() => {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                setFromDate(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-01`);
                setToDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
              }}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            />
            <Chip
              label="All Records"
              size="small"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <TextField
              label="From Date"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: '100%', md: 170 } }}
            />
            <TextField
              label="To Date"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: '100%', md: 170 } }}
            />
            <FormControl size="small" sx={{ minWidth: 240, width: { xs: '100%', md: 'auto' } }}>
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

            <TextField
              placeholder="Search batch or product…"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ flex: 1, width: { xs: '100%', md: 'auto' } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />

            {(fromDate || toDate || selectedProduct || searchQuery) && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedProduct('');
                  setSearchQuery('');
                }}
                sx={{ borderRadius: '8px' }}
              >
                Reset
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* Report Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setPage(0);
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2.5,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { fontWeight: 700, fontSize: 13, minHeight: 44, textTransform: 'none' },
        }}
      >
        {REPORT_TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>

      {/* Report Content Table */}
      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table size="small" stickyHeader>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow
                sx={{
                  '& th': {
                    bgcolor: '#f8fafc',
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.75rem',
                    py: 1.25,
                  },
                }}
              >
                <TableCell sx={{ width: 40 }}>#</TableCell>

                {/* 1. Date-wise Production */}
                {tab === 0 && (
                  <>
                    <TableCell>Batch No</TableCell>
                    <TableCell>Posting Dt</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Stage/Process</TableCell>
                    <TableCell>Belt Type</TableCell>
                    <TableCell align="right">Plan Qty</TableCell>
                    <TableCell align="right">Produce Qty</TableCell>
                    <TableCell align="right" sx={{ color: '#16a34a' }}>Accept </TableCell>
                    <TableCell align="right" sx={{ color: '#dc2626' }}>Rej. </TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </>
                )}

                {/* 2. Product-wise Production */}
                {tab === 1 && (
                  <>
                    <TableCell>Product</TableCell>
                    <TableCell>Belt Type</TableCell>
                    <TableCell>Dimensions(L×W)</TableCell>
                    <TableCell align="right">Stage 1(Roll)</TableCell>
                    <TableCell align="right">Stage 2(Sizing)</TableCell>
                    <TableCell align="right">Stage 3(Finishing)</TableCell>
                    <TableCell align="right">Stage 4(Charge)</TableCell>
                    <TableCell align="right" sx={{ color: '#16a34a', fontWeight: 800 }}>Accepted</TableCell>
                    <TableCell align="right" sx={{ color: '#dc2626' }}>Rej.</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                    <TableCell align="right">Avg Cost</TableCell>
                  </>
                )}

                {/* 3. Material Consumption */}
                {tab === 2 && (
                  <>
                    <TableCell>Raw Material / Product</TableCell>
                    <TableCell>Material Type</TableCell>
                    <TableCell align="right">Total Consumed Qty</TableCell>
                    <TableCell align="right">Avg Unit Rate</TableCell>
                    <TableCell align="right">Total Consumption Cost</TableCell>
                    <TableCell align="center">Batches Used In</TableCell>
                  </>
                )}

                {/* 4. Roll Consumption */}
                {tab === 3 && (
                  <>
                    <TableCell>Batch No</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Stage/Process</TableCell>
                    <TableCell align="right">Output Qty</TableCell>
                    <TableCell align="center">Dimensions(L×W)</TableCell>
                    <TableCell align="center">Div.Factor</TableCell>
                    <TableCell align="right" sx={{ color: '#4338ca' }}>Roll Required</TableCell> 
                    <TableCell align="right" sx={{ color: '#0284c7', fontWeight: 800 }}>Roll Consumed</TableCell>
                    <TableCell align="right">Remaining</TableCell>
                  </>
                )}

                {/* 5. Rejection & Wastage */}
                {tab === 4 && (
                  <>
                    <TableCell>Batch No</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Stage/Process</TableCell>
                    <TableCell align="right">Planned</TableCell>
                    <TableCell align="right">Produced</TableCell>
                    <TableCell align="right" sx={{ color: '#16a34a', fontWeight: 700 }}>Accepted</TableCell>
                    <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 700 }}>Rejected</TableCell>
                    <TableCell align="right">Rej.%</TableCell>
                    <TableCell align="right">Wast. Qty</TableCell>
                    <TableCell align="right">Rej. Loss</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </>
                )}

                {/* 6. Manufacturing Cost */}
                {tab === 5 && (
                  <>
                    <TableCell>Batch No</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Stage/Process</TableCell>
                    <TableCell align="right">Accepted</TableCell>
                    <TableCell align="right">Carried Cost</TableCell>
                    <TableCell align="right">Added Material</TableCell>
                    <TableCell align="right">Process Charges</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Total Batch Cost</TableCell>
                    <TableCell align="right" sx={{ color: '#15803d', fontWeight: 800 }}>Unit Cost/Pc</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {isFetching ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <TableCell key={j} sx={{ py: 1.5 }}>
                        <Skeleton height={20} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <>
                  {/* TAB 0: Date-wise Production */}
                  {tab === 0 && (
                    filteredBatches.map((b, idx) => (
                      <TableRow
                        key={b.name || idx}
                        hover
                        onClick={() => setSelectedBatchDetail(b)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0284c7', fontFamily: 'monospace' }}>
                          {b.name}
                        </TableCell>
                        <TableCell>{fmtDate(b.posting_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 650 }}>{b.product}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={b.stage_name}
                            color={b.stage === 1 ? 'info' : b.stage === 2 ? 'primary' : b.stage === 3 ? 'warning' : 'success'}
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>{b.belt_type || 'Standard'}</TableCell>
                        <TableCell align="right">{fmtNum(b.planned_quantity, 3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(b.produced_quantity, 3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750, color: '#16a34a' }}>
                          {fmtNum(b.accepted_quantity, 3)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: b.rejected_quantity > 0 ? '#dc2626' : 'text.secondary' }}>
                          {fmtNum(b.rejected_quantity, 3)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(b.batch_total, 2)}</TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={b.status}
                            color={b.status === 'Completed' ? 'success' : 'default'}
                            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* TAB 1: Product-wise Production */}
                  {tab === 1 && (
                    productSummaryList.map((p, idx) => (
                      <TableRow key={p.product || idx} hover>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 750, color: '#0f172a' }}>{p.product}</TableCell>
                        <TableCell>{p.belt_type || 'Standard'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{p.dimensions}</TableCell>
                        <TableCell align="right">{fmtNum(p.stage1_qty, 3)}</TableCell>
                        <TableCell align="right">{fmtNum(p.stage2_qty, 3)}</TableCell>
                        <TableCell align="right">{fmtNum(p.stage3_qty, 3)}</TableCell>
                        <TableCell align="right">{fmtNum(p.stage4_qty, 3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#16a34a' }}>
                          {fmtNum(p.total_accepted, 3)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: p.total_rejected > 0 ? '#dc2626' : 'text.secondary' }}>
                          {fmtNum(p.total_rejected, 3)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{fmtMoney(p.total_cost, 2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#15803d' }}>
                          {fmtMoney(p.avg_unit_cost, 2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* TAB 2: Material Consumption */}
                  {tab === 2 && (
                    materialConsumptionList.map((m, idx) => (
                      <TableRow key={m.product || idx} hover>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{m.product}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={m.is_intermediate ? 'Intermediate Semi-Finished' : 'Raw Material'}
                            color={m.is_intermediate ? 'secondary' : 'default'}
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#0284c7' }}>
                          {fmtNum(m.total_consumed, 3)}
                        </TableCell>
                        <TableCell align="right">{fmtMoney(m.avg_rate, 2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {fmtMoney(m.total_cost, 2)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={`${m.batches_count} batches`}
                            sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* TAB 3: Roll Consumption */}
                  {tab === 3 && (
                    filteredBatches.map((b, idx) => (
                      <TableRow
                        key={b.name || idx}
                        hover
                        onClick={() => setSelectedBatchDetail(b)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0284c7', fontFamily: 'monospace' }}>
                          {b.name}
                        </TableCell>
                        <TableCell>{fmtDate(b.posting_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 650 }}>{b.product}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={b.stage_name}
                            color={b.stage === 1 ? 'info' : b.stage === 2 ? 'primary' : 'default'}
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11 }}
                          />
                        </TableCell>
                        <TableCell align="right">{fmtNum(b.produced_quantity, 3)}</TableCell>
                        <TableCell align="center">
                          {b.length > 0 && b.width > 0 ? `${b.length} × ${b.width} mm` : '—'}
                        </TableCell>
                        <TableCell align="center">{b.roll_division_factor || 1}</TableCell>
                        <TableCell align="right" sx={{ color: '#4338ca', fontWeight: 600 }}>
                          {fmtNum(b.roll_required, 3)} m
                        </TableCell>
                        <TableCell align="right" sx={{ color: '#0284c7', fontWeight: 800 }}>
                          {fmtNum(b.roll_consumed, 3)} m
                        </TableCell>
                        <TableCell align="right">{fmtNum(b.remaining_roll, 3)} m</TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* TAB 4: Rejection & Wastage */}
                  {tab === 4 && (
                    filteredBatches.map((b, idx) => (
                      <TableRow
                        key={b.name || idx}
                        hover
                        onClick={() => setSelectedBatchDetail(b)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0284c7', fontFamily: 'monospace' }}>
                          {b.name}
                        </TableCell>
                        <TableCell>{fmtDate(b.posting_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 650 }}>{b.product}</TableCell>
                        <TableCell>{b.stage_name}</TableCell>
                        <TableCell align="right">{fmtNum(b.planned_quantity, 3)}</TableCell>
                        <TableCell align="right">{fmtNum(b.produced_quantity, 3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750, color: '#16a34a' }}>
                          {fmtNum(b.accepted_quantity, 3)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750, color: b.rejected_quantity > 0 ? '#dc2626' : 'text.secondary' }}>
                          {fmtNum(b.rejected_quantity, 3)}
                        </TableCell>
                        <TableCell align="right">{fmtNum(b.rejection_percent, 2)}%</TableCell>
                        <TableCell align="right">{fmtNum(b.wastage_qty, 3)}</TableCell>
                        <TableCell align="right">{fmtMoney(b.rejection_amount, 2)}</TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={b.status}
                            color={b.status === 'Completed' ? 'success' : 'default'}
                            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* TAB 5: Manufacturing Cost */}
                  {tab === 5 && (
                    filteredBatches.map((b, idx) => (
                      <TableRow
                        key={b.name || idx}
                        hover
                        onClick={() => setSelectedBatchDetail(b)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0284c7', fontFamily: 'monospace' }}>
                          {b.name}
                        </TableCell>
                        <TableCell>{fmtDate(b.posting_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 650 }}>{b.product}</TableCell>
                        <TableCell>{b.stage_name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a' }}>
                          {fmtNum(b.accepted_quantity, 3)}
                        </TableCell>
                        <TableCell align="right">{fmtMoney(b.carried_cost, 2)}</TableCell>
                        <TableCell align="right">{fmtMoney(b.added_cost, 2)}</TableCell>
                        <TableCell align="right">{fmtMoney(b.charge_total, 2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{fmtMoney(b.batch_total, 2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#15803d' }}>
                          {fmtMoney(b.unit_cost, 2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* Empty state */}
                  {filteredBatches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        <CalendarMonthOutlinedIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                        <Typography variant="body1" sx={{ fontWeight: 700 }}>
                          No belt production records match the selected filters.
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Try expanding your date range or clearing product filter.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>

            {/* Sticky Grand Total Footer */}
            {!isFetching && filteredBatches.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 800, py: 1.25, borderTop: '2px solid #cbd5e1' } }}>
                  <TableCell align="center" colSpan={tab === 1 ? 4 : tab === 2 ? 2 : 4}>
                    Grand Total
                  </TableCell>

                  {tab === 0 && (
                    <>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right">{fmtNum(kpis.totalPlanned, 3)}</TableCell>
                      <TableCell align="right">{fmtNum(kpis.totalProduced, 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#16a34a' }}>{fmtNum(kpis.totalAccepted, 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626' }}>{fmtNum(kpis.totalRejected, 3)}</TableCell>
                      <TableCell align="right">{fmtMoney(kpis.totalCost, 2)}</TableCell>
                      <TableCell align="center"></TableCell>
                    </>
                  )}

                  {tab === 1 && (
                    <>
                      <TableCell align="right">{fmtNum(productSummaryList.reduce((s, p) => s + p.stage1_qty, 0), 3)}</TableCell>
                      <TableCell align="right">{fmtNum(productSummaryList.reduce((s, p) => s + p.stage2_qty, 0), 3)}</TableCell>
                      <TableCell align="right">{fmtNum(productSummaryList.reduce((s, p) => s + p.stage3_qty, 0), 3)}</TableCell>
                      <TableCell align="right">{fmtNum(productSummaryList.reduce((s, p) => s + p.stage4_qty, 0), 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#16a34a' }}>{fmtNum(kpis.totalAccepted, 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626' }}>{fmtNum(kpis.totalRejected, 3)}</TableCell>
                      <TableCell align="right">{fmtMoney(kpis.totalCost, 2)}</TableCell>
                      <TableCell align="right" sx={{ color: '#15803d' }}>{fmtMoney(kpis.avgUnitCost, 2)}</TableCell>
                    </>
                  )}

                  {tab === 2 && (
                    <>
                      <TableCell align="right" sx={{ color: '#0284c7' }}>
                        {fmtNum(materialConsumptionList.reduce((s, m) => s + m.total_consumed, 0), 3)}
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right">
                        {fmtMoney(materialConsumptionList.reduce((s, m) => s + m.total_cost, 0), 2)}
                      </TableCell>
                      <TableCell align="center"></TableCell>
                    </>
                  )}

                  {tab === 3 && (
                    <>
                      <TableCell align="right">{fmtNum(kpis.totalProduced, 3)}</TableCell>
                      <TableCell align="center"></TableCell>
                      <TableCell align="center"></TableCell>
                      <TableCell align="right" sx={{ color: '#4338ca' }}>{fmtNum(rollSummary.total_roll_required, 3)} m</TableCell>
                      <TableCell align="right" sx={{ color: '#0284c7' }}>{fmtNum(rollSummary.total_roll_consumed, 3)} m</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626' }}>{fmtNum(rollSummary.total_roll_wastage, 3)} m</TableCell>
                      <TableCell align="right">{fmtNum(rollSummary.available_roll_balance, 3)} m</TableCell>
                    </>
                  )}

                  {tab === 4 && (
                    <>
                      <TableCell align="right">{fmtNum(kpis.totalPlanned, 3)}</TableCell>
                      <TableCell align="right">{fmtNum(kpis.totalProduced, 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#16a34a' }}>{fmtNum(kpis.totalAccepted, 3)}</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626' }}>{fmtNum(kpis.totalRejected, 3)}</TableCell>
                      <TableCell align="right">{fmtNum(kpis.rejectionRate, 2)}%</TableCell>
                      <TableCell align="right">{fmtNum(rollSummary.total_roll_wastage, 3)}</TableCell>
                      <TableCell align="right">₹0.00</TableCell>
                      <TableCell align="center"></TableCell>
                    </>
                  )}

                  {tab === 5 && (
                    <>
                      <TableCell align="right" sx={{ color: '#16a34a' }}>{fmtNum(kpis.totalAccepted, 3)}</TableCell>
                      <TableCell align="right">{fmtMoney(reportData?.cost_summary?.total_carried_cost || 0, 2)}</TableCell>
                      <TableCell align="right">{fmtMoney(reportData?.cost_summary?.total_added_cost || 0, 2)}</TableCell>
                      <TableCell align="right">{fmtMoney(reportData?.cost_summary?.total_charges || 0, 2)}</TableCell>
                      <TableCell align="right">{fmtMoney(kpis.totalCost, 2)}</TableCell>
                      <TableCell align="right" sx={{ color: '#15803d' }}>{fmtMoney(kpis.avgUnitCost, 2)}</TableCell>
                    </>
                  )}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      </Paper>

      {/* Batch Details Drilldown Dialog */}
      <Dialog
        open={Boolean(selectedBatchDetail)}
        onClose={() => setSelectedBatchDetail(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Batch Details: {selectedBatchDetail?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedBatchDetail?.stage_name} · {selectedBatchDetail?.product} · {fmtDate(selectedBatchDetail?.posting_date)}
            </Typography>
          </Box>
          <IconButton onClick={() => setSelectedBatchDetail(null)} size="small">
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selectedBatchDetail && (
            <Stack spacing={2.5}>
              {/* Top Stats Grid */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  gap: 1.5,
                }}
              >
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px' }}>
                  <Typography variant="caption" color="text.secondary">Produced Qty</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {fmtNum(selectedBatchDetail.produced_quantity, 3)}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px' }}>
                  <Typography variant="caption" color="text.secondary">Accepted Qty</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#16a34a' }}>
                    {fmtNum(selectedBatchDetail.accepted_quantity, 3)}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px' }}>
                  <Typography variant="caption" color="text.secondary">Roll Consumed</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#0284c7' }}>
                    {fmtNum(selectedBatchDetail.roll_consumed, 3)} m
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px' }}>
                  <Typography variant="caption" color="text.secondary">Total Batch Cost</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
                    {fmtMoney(selectedBatchDetail.batch_total, 2)}
                  </Typography>
                </Paper>
              </Box>

              {/* Material Items Consumed */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
                  Materials & Components Consumed in this Batch ({selectedBatchDetail.items?.length || 0})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Material / Item</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Consumed Qty</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Unit Rate</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Total Cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedBatchDetail.items && selectedBatchDetail.items.length > 0 ? (
                        selectedBatchDetail.items.map((it, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ fontWeight: 650 }}>{it.product}</TableCell>
                            <TableCell align="right">{fmtNum(it.utilization, 3)}</TableCell>
                            <TableCell align="right">{fmtMoney(it.unit_price, 2)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(it.amount, 2)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                            No raw materials recorded directly in this batch stage.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Process Charges if any */}
              {selectedBatchDetail.charges && selectedBatchDetail.charges.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
                    Process Charges ({selectedBatchDetail.charges.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Charge Name</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Rate</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedBatchDetail.charges.map((ch, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ fontWeight: 650 }}>{ch.charge}</TableCell>
                            <TableCell align="right">{fmtNum(ch.quantity, 0)}</TableCell>
                            <TableCell align="right">{fmtMoney(ch.per_unit_price, 2)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(ch.amount, 2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
