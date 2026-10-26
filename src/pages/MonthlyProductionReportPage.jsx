import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
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
  CalendarMonthOutlined,
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  ElectricBoltOutlined,
  FilterListRounded,
  PrecisionManufacturingOutlined,
  RefreshRounded,
  SearchRounded,
  TuneOutlined,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { call, getList } from '../api/client';
import { db } from '../db/dexie';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { palette } from '../theme';
import { toInternalStage } from '../lib/stageLabels';

/**
 * Normalizes any date string (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, ISO) into YYYY-MM-DD
 * to guarantee accurate date filtering and comparisons.
 */
function normalizeDateStr(dt) {
  if (!dt) return '';
  const s = String(dt).trim();

  // Match DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  return s.slice(0, 10);
}

function getInitialMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const end = new Date(y, m, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(end.getDate())}`,
  };
}

function StatCard({ label, value, subtitle, icon: Icon, iconBg, iconColor }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
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
      <Box sx={{ minWidth: 0, pr: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ mt: 0.5, mb: 0.25, fontWeight: 750, color: '#12262a' }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: '10px',
          bgcolor: iconBg || '#f0fdf4',
          color: iconColor || palette.teal,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </Box>
    </Paper>
  );
}

export default function MonthlyProductionReportPage() {
  const initialRange = useMemo(() => getInitialMonthRange(), []);

  // Filters: From Date, To Date, Product Name, Product Code, Production Code
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [productSearch, setProductSearch] = useState('');
  const [productCodeFilter, setProductCodeFilter] = useState('');
  const [productionCodeFilter, setProductionCodeFilter] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [drilldownRow, setDrilldownRow] = useState(null);

  // Validation: From Date not later than To Date
  const isDateRangeInvalid = fromDate && toDate && normalizeDateStr(fromDate) > normalizeDateStr(toDate);

  // Masters from Dexie
  const products = useLiveQuery(() => db.Product.toArray(), []) || [];

  // 1. Fetch proven datewise production & inventory records from backend API
  const { data: datewiseRecords = [], isFetching: isDatewiseFetching, refetch: refetchDatewise } = useQuery({
    queryKey: ['datewise_production_report', fromDate, toDate],
    queryFn: async () => {
      try {
        const res = await call('clssurya.api.get_datewise_production_inventory', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        });
        return Array.isArray(res) ? res : [];
      } catch (_) {
        return [];
      }
    },
    staleTime: 10_000,
  });

  // 2. Fetch monthly production report aggregation if available on backend
  const serverQuery = useQuery({
    queryKey: [
      'monthly_production_report',
      fromDate,
      toDate,
      productSearch,
      productCodeFilter,
      productionCodeFilter,
    ],
    queryFn: async () => {
      if (isDateRangeInvalid) return { rows: [] };
      try {
        const res = await call('clssurya.api.get_monthly_production_report', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          product: productSearch || undefined,
          product_code: productCodeFilter || undefined,
          production_code: productionCodeFilter || undefined,
        });
        return res || { rows: [] };
      } catch (_) {
        return { rows: [] };
      }
    },
    enabled: !isDateRangeInvalid,
    staleTime: 10_000,
  });

  // 3. Direct queries for Stage 1, Stage 2, Stage 3 batches and Inventory
  const { data: stage1Batches = [], refetch: refetchStg1 } = useQuery({
    queryKey: ['list', 'Stage 1 Batch'],
    queryFn: () => getList('Stage 1 Batch').catch(() => []),
    staleTime: 30 * 1000,
  });

  const { data: stage2Batches = [], refetch: refetchStg2 } = useQuery({
    queryKey: ['list', 'Stage 2 Batch'],
    queryFn: () => getList('Stage 2 Batch').catch(() => []),
    staleTime: 30 * 1000,
  });

  const { data: stage3Batches = [], refetch: refetchStg3 } = useQuery({
    queryKey: ['list', 'Stage 3 Batch'],
    queryFn: () => getList('Stage 3 Batch').catch(() => []),
    staleTime: 30 * 1000,
  });

  const { data: serverInventory = [], refetch: refetchInv } = useQuery({
    queryKey: ['list', 'Inventory'],
    queryFn: () => getList('Inventory').catch(() => []),
    staleTime: 30 * 1000,
  });

  const handleRefreshAll = () => {
    refetchDatewise();
    serverQuery.refetch();
    refetchStg1();
    refetchStg2();
    refetchStg3();
    refetchInv();
  };

  // Product lookup map
  const prodMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.name) map.set(p.name, p);
      if (p.product_code) map.set(p.product_code, p);
      if (p.product_name) map.set(p.product_name, p);
    });
    return map;
  }, [products]);

  // Robust client-side aggregation across batch history and inventory
  const computedClientRows = useMemo(() => {
    if (isDateRangeInvalid) return [];

    const normFrom = normalizeDateStr(fromDate);
    const normTo = normalizeDateStr(toDate);

    // Saved production codes from local storage
    const savedProdCodes = (() => {
      try {
        return JSON.parse(localStorage.getItem('finished_prod_codes') || '{}');
      } catch {
        return {};
      }
    })();

    // Partial transfer map from local storage
    const transferredMap = (() => {
      try {
        return JSON.parse(localStorage.getItem('batch_transfers_map') || '{}');
      } catch {
        return {};
      }
    })();

    // 1. Gather all batch records (from datewiseRecords AND direct batch lists)
    const allBatches = [];
    const seenBatchKeys = new Set();

    const addBatch = (b, stageNum, stageLabel) => {
      if (!b) return;
      // Exclude cancelled transactions
      if (b.docstatus === 2 || b.status === 'Cancelled') return;

      const batchKey = `${stageNum}_${b.name || b.batch_no || ''}_${b.posting_date || b.production_date || ''}_${b.product || b.product_code || ''}`;
      if (seenBatchKeys.has(batchKey)) return;
      seenBatchKeys.add(batchKey);

      allBatches.push({
        ...b,
        stage_num: stageNum,
        stage_label: stageLabel,
        batch_no: b.batch_no || b.name || '',
      });
    };

    // Add from direct stage lists
    (stage1Batches || []).forEach((b) => addBatch(b, 1, 'Stage 1 – Insert Making'));
    (stage2Batches || []).forEach((b) => addBatch(b, 2, 'Stage 2 – PU & Casting'));
    (stage3Batches || []).forEach((b) => addBatch(b, 3, 'Stage 3 – CNC'));

    // Add from datewiseRecords API
    (datewiseRecords || []).forEach((r) => {
      const stg = String(r.stage || r.stage_label || '');
      if (stg.includes('1') || stg.includes('Insert')) {
        addBatch(r, 1, 'Stage 1 – Insert Making');
      } else if (stg.includes('2') || stg.includes('PU') || stg.includes('Casting')) {
        addBatch(r, 2, 'Stage 2 – PU & Casting');
      } else if (stg.includes('3') || stg.includes('CNC')) {
        addBatch(r, 3, 'Stage 3 – CNC');
      }
    });

    // 2. Finished Goods tracking
    const fgTransfersByProd = new Map();

    // From datewiseRecords Finished Goods
    (datewiseRecords || []).forEach((r) => {
      const isFin = r.stage === 'Finished' || r.stage_label === 'Finished Goods' || r.stage === 'Finished Goods';
      if (isFin) {
        const rawDt = r.production_date || r.modified || r.creation;
        const normDt = normalizeDateStr(rawDt);
        if ((!normFrom || normDt >= normFrom) && (!normTo || normDt <= normTo)) {
          const pKey = r.product_code || r.product || r.product_name;
          const qty = Number(r.produced_qty || r.input_qty || r.available_qty || r.stock || 0);
          fgTransfersByProd.set(pKey, (fgTransfersByProd.get(pKey) || 0) + qty);
        }
      }
    });

    // From server Inventory Finished Goods
    (serverInventory || []).forEach((inv) => {
      const isFin = inv.stage === 'Finished' || toInternalStage(inv.stage) === 'Finished';
      if (isFin) {
        const rawDt = inv.modified || inv.creation;
        const normDt = normalizeDateStr(rawDt);
        const pKey = inv.product || inv.product_code || inv.name;
        const qty = Number(inv.stock || 0);
        if (qty > 0) {
          if (!fgTransfersByProd.has(pKey)) {
            fgTransfersByProd.set(pKey, qty);
          }
        }
      }
    });

    // 3. Aggregate batches into product rows according to product
    const groups = {};

    allBatches.forEach((b) => {
      const rawDt = b.production_date || b.posting_date || b.modified || b.creation || '';
      const normDt = normalizeDateStr(rawDt);

      // Filter by selected duration
      if (normFrom && normDt && normDt < normFrom) return;
      if (normTo && normDt && normDt > normTo) return;

      const prodIdentifier = b.product || b.product_code || b.product_name || '';
      if (!prodIdentifier) return;

      const p = prodMap.get(prodIdentifier) || prodMap.get(b.product_name) || {};
      const prodCode = p.product_code || b.product_code || prodIdentifier || '—';
      const prodName = p.product_name || b.product_name || prodIdentifier || '—';

      // Production Code resolution
      const prodCodeCandidate =
        b.production_code ||
        p.production_code ||
        savedProdCodes[prodIdentifier] ||
        savedProdCodes[prodCode] ||
        savedProdCodes[prodName] ||
        '';

      const uom = p.uom || b.uom || 'PCS';

      // Group key by product so all stages roll up together
      const groupKey = prodIdentifier;

      let monthNo = 1;
      if (normDt) {
        const parts = normDt.split('-');
        if (parts[1]) monthNo = parseInt(parts[1], 10);
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          month_no: monthNo,
          production_date: normDt || rawDt,
          product: prodIdentifier,
          product_code: prodCode,
          production_code: prodCodeCandidate || p.production_code || '—',
          product_name: prodName,
          uom: uom,
          stage1_qty: 0,
          stage2_qty: 0,
          stage3_qty: 0,
          finished_goods_qty: 0,
          rejected_qty: 0,
          total_production_cost: 0,
          batch_count: 0,
          batches: [],
        };
      }

      const g = groups[groupKey];
      // Keep latest production date for representation
      if (normDt && normDt > normalizeDateStr(g.production_date)) {
        g.production_date = normDt;
        const parts = normDt.split('-');
        if (parts[1]) g.month_no = parseInt(parts[1], 10);
      }

      if (prodCodeCandidate && (!g.production_code || g.production_code === '—')) {
        g.production_code = prodCodeCandidate;
      }

      const qty = Number(b.quantity || b.produced_qty || b.input_qty) || 0;
      const rejPct = Number(b.rejection_percent) || 0;
      const rejQty = Number(b.rejected_qty) > 0 ? Number(b.rejected_qty) : (qty * rejPct) / 100;

      // Net production cost calculation without double counting carried material
      const bTotal = Number(b.batch_total) || 0;
      const carried = Number(b.carried_cost) || 0;
      const added = Number(b.added_cost) || 0;
      const rejCost = Number(b.rejection_amount) || 0;
      const tooling = Number(b.tooling_amount) || 0;
      const unitCost = Number(b.unit_cost) || 0;

      let netCost = 0;
      if (b.stage_num === 1) {
        netCost = bTotal > 0 ? bTotal : (added + rejCost > 0 ? added + rejCost : unitCost * qty);
      } else if (b.stage_num === 2) {
        if (carried > 0 && bTotal >= carried) {
          netCost = bTotal - carried;
        } else {
          netCost = (added + rejCost) > 0 ? (added + rejCost) : (bTotal > 0 ? bTotal : unitCost * qty);
        }
      } else {
        if (carried > 0 && bTotal >= carried) {
          netCost = bTotal - carried;
        } else {
          netCost = (added + tooling + rejCost) > 0 ? (added + tooling + rejCost) : (bTotal > 0 ? bTotal : unitCost * qty);
        }
      }

      // Fallback if batch has 0 cost
      if (netCost <= 0 && qty > 0) {
        const stdCost = Number(p.production_cost || p.valuation_rate || 0);
        if (stdCost > 0) netCost = stdCost * qty;
      }

      if (b.stage_num === 1) g.stage1_qty += qty;
      else if (b.stage_num === 2) g.stage2_qty += qty;
      else if (b.stage_num === 3) g.stage3_qty += qty;

      g.rejected_qty += rejQty;
      g.total_production_cost += netCost;
      g.batch_count += 1;

      // Check for partial transfers to Finished Goods
      const trQty = transferredMap[b.batch_no || b.name] || 0;
      if (b.stage_num === 3 && trQty > 0) {
        g.finished_goods_qty += trQty;
      }

      g.batches.push({
        production_date: normDt || rawDt,
        batch_no: b.batch_no || b.name || '',
        product_code: prodCode,
        production_code: g.production_code,
        product_name: prodName,
        stage: b.stage_label || `Stage ${b.stage_num}`,
        produced_qty: qty,
        rejected_qty: rejQty,
        batch_status: b.status || (b.docstatus === 1 ? 'Submitted' : 'Active'),
        production_cost: bTotal > 0 ? bTotal : netCost,
        unit_cost: unitCost > 0 ? unitCost : (qty > 0 ? netCost / qty : 0),
      });
    });

    // 4. Assign Finished Goods quantities to product rows
    const result = Object.values(groups);
    result.forEach((g) => {
      const pKey = g.product;
      const fgFound =
        fgTransfersByProd.get(pKey) ||
        fgTransfersByProd.get(g.product_code) ||
        fgTransfersByProd.get(g.product_name) ||
        0;

      if (g.finished_goods_qty === 0) {
        if (fgFound > 0) {
          g.finished_goods_qty = fgFound;
        } else if (g.stage3_qty > 0) {
          // If stage 3 completed output exists and inventory shows finished
          g.finished_goods_qty = Math.max(0, g.stage3_qty - g.rejected_qty);
        }
      }
    });

    return result.sort((a, b) => {
      const dA = normalizeDateStr(a.production_date);
      const dB = normalizeDateStr(b.production_date);
      if (dA !== dB) return dB.localeCompare(dA);
      return a.product_name.localeCompare(b.product_name);
    });
  }, [stage1Batches, stage2Batches, stage3Batches, datewiseRecords, serverInventory, prodMap, fromDate, toDate, isDateRangeInvalid]);

  // Use server rows if populated, otherwise use computed client rows
  const allRows = useMemo(() => {
    const sRows = serverQuery.data?.rows || [];
    if (sRows.length > 0) {
      return sRows.map((r) => {
        const prodId = r.product || r.product_code || r.product_name || '';
        const p = prodMap.get(prodId) || {};
        const normDt = normalizeDateStr(r.production_date);
        let mNo = r.month_no;
        if (!mNo && normDt) {
          const parts = normDt.split('-');
          if (parts[1]) mNo = parseInt(parts[1], 10);
        }

        return {
          ...r,
          month_no: mNo || 1,
          production_date: normDt || r.production_date,
          product: prodId,
          product_code: r.product_code || p.product_code || prodId || '—',
          production_code: r.production_code && r.production_code !== '—' ? r.production_code : (p.production_code || '—'),
          product_name: r.product_name || p.product_name || prodId || '—',
          uom: r.uom || p.uom || 'PCS',
          stage1_qty: Number(r.stage1_qty ?? r.insert_output ?? r.insert_input ?? 0),
          stage2_qty: Number(r.stage2_qty ?? r.casting_output ?? r.casting_input ?? 0),
          stage3_qty: Number(r.stage3_qty ?? r.cnc_output ?? r.cnc_input ?? 0),
          finished_goods_qty: Number(r.finished_goods_qty ?? r.total_accepted_final ?? 0),
          rejected_qty: Number(r.rejected_qty ?? 0),
          total_production_cost: Number(r.total_production_cost ?? 0),
        };
      });
    }
    return computedClientRows;
  }, [serverQuery.data, computedClientRows, prodMap]);

  // Apply search/code filters
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (productSearch.trim()) {
        const q = productSearch.trim().toLowerCase();
        const pName = (r.product_name || r.product || '').toLowerCase();
        if (!pName.includes(q)) return false;
      }
      if (productCodeFilter.trim()) {
        const q = productCodeFilter.trim().toLowerCase();
        const pCode = (r.product_code || '').toLowerCase();
        if (!pCode.includes(q)) return false;
      }
      if (productionCodeFilter.trim()) {
        const q = productionCodeFilter.trim().toLowerCase();
        const prodCode = (r.production_code || '').toLowerCase();
        if (!prodCode.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, productSearch, productCodeFilter, productionCodeFilter]);

  // Overall totals across filtered rows
  const overall = useMemo(() => {
    let stage1Total = 0,
      stage2Total = 0,
      stage3Total = 0,
      fgTotal = 0,
      rejectedTotal = 0,
      costTotal = 0;

    filteredRows.forEach((r) => {
      stage1Total += Number(r.stage1_qty) || 0;
      stage2Total += Number(r.stage2_qty) || 0;
      stage3Total += Number(r.stage3_qty) || 0;
      fgTotal += Number(r.finished_goods_qty) || 0;
      rejectedTotal += Number(r.rejected_qty) || 0;
      costTotal += Number(r.total_production_cost) || 0;
    });

    return {
      stage1Total,
      stage2Total,
      stage3Total,
      fgTotal,
      rejectedTotal,
      costTotal,
    };
  }, [filteredRows]);

  const reportingPeriodLabel = useMemo(() => {
    if (fromDate && toDate) {
      return `${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
    }
    return 'All Dates';
  }, [fromDate, toDate]);

  const primaryUom = filteredRows[0]?.uom || 'PCS';

  // Export to CSV with all columns
  const handleExportCSV = () => {
    if (!filteredRows.length) return;
    const headers = [
      '#',
      'Production Date',
      'Product Code',
      'Production Code',
      'Product Name',
      'UOM',
      'Stage 1 – Insert Making Qty',
      'Stage 2 – PU & Casting Qty',
      'Stage 3 – CNC Qty',
      'Finished Goods Qty',
      'Rejected Qty',
      'Total Production Cost',
    ];

    const csvRows = filteredRows.map((r, i) => [
      i + 1,
      r.month_no || 1,
      `"${r.production_date || ''}"`,
      `"${r.product_code || ''}"`,
      `"${r.production_code || ''}"`,
      `"${r.product_name || ''}"`,
      `"${r.uom || 'PCS'}"`,
      r.stage1_qty || 0,
      r.stage2_qty || 0,
      r.stage3_qty || 0,
      r.finished_goods_qty || 0,
      r.rejected_qty || 0,
      r.total_production_cost || 0,
    ]);

    // Append Grand Total Row to CSV
    csvRows.push([
      'Total',
      '',
      `"${reportingPeriodLabel}"`,
      '',
      '',
      '"Grand Total"',
      `"${primaryUom}"`,
      overall.stage1Total,
      overall.stage2Total,
      overall.stage3Total,
      overall.fgTotal,
      overall.rejectedTotal,
      overall.costTotal,
    ]);
      

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Monthly_Production_Report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const handleResetFilters = () => {
    const init = getInitialMonthRange();
    setFromDate(init.from);
    setToDate(init.to);
    setProductSearch('');
    setProductCodeFilter('');
    setProductionCodeFilter('');
    setPage(0);
  };

  const isFiltered =
    fromDate !== initialRange.from ||
    toDate !== initialRange.to ||
    productSearch ||
    productCodeFilter ||
    productionCodeFilter;

  const isLoading = serverQuery.isLoading || isDatewiseFetching;

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ mb: 3, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 750, color: '#12262a' }}>
              Monthly Production Report
            </Typography>
            <Chip
              size="small"
              label={`${filteredRows.length} Product Rows`}
              sx={{
                bgcolor: '#e6f0ee',
                color: palette.teal,
                fontWeight: 700,
                fontSize: 12,
                borderRadius: '8px',
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Total quantity produced in each production stage for <strong>{reportingPeriodLabel}</strong>.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="Export Report to CSV">
            <span>
              <IconButton
                onClick={handleExportCSV}
                disabled={!filteredRows.length}
                sx={{
                  bgcolor: '#ffffff',
                  border: '1px solid #dde5e3',
                  '&:hover': { bgcolor: '#f3f6f5' },
                }}
              >
                <DownloadRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Refresh Data">
            <span>
              <IconButton
                onClick={handleRefreshAll}
                disabled={isLoading}
                sx={{
                  bgcolor: '#ffffff',
                  border: '1px solid #dde5e3',
                  '&:hover': { bgcolor: '#f3f6f5' },
                }}
              >
                <RefreshRounded
                  fontSize="small"
                  sx={{
                    animation: isLoading ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Date Validation Alert */}
      {isDateRangeInvalid && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '10px' }}>
          <strong>Invalid Date Range:</strong> From Date cannot be later than To Date. Please adjust your date filters.
        </Alert>
      )}

      {/* 4 Summary Cards at the Top */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Total Stage 1 – Insert Making"
          value={`${fmtNum(overall.stage1Total, 0)} ${primaryUom}`}
          //subtitle={`Stage 1 output • ${reportingPeriodLabel}`}
          icon={PrecisionManufacturingOutlined}
          iconBg="#eef2ff"
          iconColor="#4338ca"
        />
        <StatCard
          label="Total Stage 2 – PU & Casting"
          value={`${fmtNum(overall.stage2Total, 0)} ${primaryUom}`}
          //subtitle={`Stage 2 output • ${reportingPeriodLabel}`}
          icon={TuneOutlined}
          iconBg="#f5f3ff"
          iconColor="#6d28d9"
        />
        <StatCard
          label="Total Stage 3 – CNC"
          value={`${fmtNum(overall.stage3Total, 0)} ${primaryUom}`}
          //subtitle={`Stage 3 output • ${reportingPeriodLabel}`}
          icon={ElectricBoltOutlined}
          iconBg="#fffbeb"
          iconColor="#b45309"
        />
        <StatCard
          label="Total Finished Goods"
          value={`${fmtNum(overall.fgTotal, 0)} ${primaryUom}`}
          //subtitle={`Transferred into FG • ${reportingPeriodLabel}`}
          icon={CheckCircleOutlineRounded}
          iconBg="#ecfdf5"
          iconColor="#059669"
        />
      </Box>

      {/* Report Filters: From Date, To Date, Product Name, Product Code, Production Code */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          borderRadius: '14px',
          bgcolor: '#ffffff',
          borderColor: '#dde5e3',
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FilterListRounded sx={{ fontSize: 20, color: palette.teal }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#12262a' }}>
              Report Filters
            </Typography>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', gap: 1 }}>
            {/* Filter 1: From Date */}
            <Box sx={{ width: { xs: '100%', sm: 160 } }}>
              <Typography variant="caption" sx={{ fontWeight: 650, color: 'text.secondary', mb: 0.3, display: 'block' }}>
                From Date
              </Typography>
              <TextField
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                error={Boolean(isDateRangeInvalid)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#f8faf9' } }}
              />
            </Box>

            {/* Filter 2: To Date */}
            <Box sx={{ width: { xs: '100%', sm: 160 } }}>
              <Typography variant="caption" sx={{ fontWeight: 650, color: 'text.secondary', mb: 0.3, display: 'block' }}>
                To Date
              </Typography>
              <TextField
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                error={Boolean(isDateRangeInvalid)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#f8faf9' } }}
              />
            </Box>

            {/* Filter 3: Product Name */}
            <Box sx={{ flex: 1, minWidth: 170 }}>
              <Typography variant="caption" sx={{ fontWeight: 650, color: 'text.secondary', mb: 0.3, display: 'block' }}>
                Product Name
              </Typography>
              <TextField
                placeholder="Search product…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                size="small"
                
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#f8faf9' } }}
              />
            </Box>

            

            {/* Reset Button */}
            {isFiltered && (
              <Box sx={{ alignSelf: { md: 'flex-end' }, pb: 0.3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleResetFilters}
                  sx={{ borderRadius: '8px', fontSize: 12, color: 'text.secondary', borderColor: '#dde5e3' }}
                >
                  Reset
                </Button>
              </Box>
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* Product-wise Production Table */}
      <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ maxHeight: 720 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 750, color: '#1e293b', whiteSpace: 'nowrap', py: 1.25 } }}>
                {/* 1. Row Counter */}
                <TableCell align="center" sx={{ width: 50 }}>#</TableCell>
                {/* 2. Production Date */}
                <TableCell align="center">Production Date</TableCell>
                {/* 4. Product Code */}
                {/* <TableCell>Product Code</TableCell> */}
                {/* 5. Production Code */}
                {/* <TableCell>Production Code</TableCell> */}
                {/* 6. Product Name */}
                <TableCell>Product Name</TableCell>
                {/* 7. UOM */}
                <TableCell align="center">UOM</TableCell>
                {/* 8. Stage 1 Total Qty */}
                <TableCell align="center" sx={{ color: '#4338ca' }}>
                  Stage 1 Total Qty
                </TableCell>
                {/* 9. Stage 2 Total Qty */}
                <TableCell align="center" sx={{ color: '#6d28d9' }}>
                  Stage 2 Total Qty
                </TableCell>
                {/* 10. Stage 3 Total Qty */}
                <TableCell align="center" sx={{ color: '#b45309' }}>
                  Stage 3 Total Qty
                </TableCell>
                {/* 11. Finished Goods Qty */}
                <TableCell align="center" sx={{ color: '#059669' }}>
                  Finished Goods Qty
                </TableCell>
                {/* 12. Rejected Qty */}
                <TableCell align="center" sx={{ color: '#dc2626' }}>
                  Rejected Qty
                </TableCell>
                {/* 13. Total Production Cost */}
                <TableCell align="right" sx={{ color: '#0f766e', fontWeight: 800 }}>
                  Total Production Cost
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 13 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} sx={{ py: 6, textAlign: 'center' }}>
                    <CalendarMonthOutlined sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      No production data recorded
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      No batch or inventory transactions found matching your selected date range and filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => {
                  const rowNumber = page * rowsPerPage + idx + 1;
                  return (
                    <TableRow
                      key={`${row.product}-${row.production_code}-${idx}`}
                      hover
                      onClick={() => setDrilldownRow(row)}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f8faf9' } }}
                    >
                      {/* 1. Row Counting: 1, 2, ... N */}
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 12 }}>
                        {rowNumber}
                      </TableCell>

                     

                      {/* 3. Production Date */}
                      <TableCell align="center" sx={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                        {fmtDate(row.production_date)}
                      </TableCell>


                     

                      {/* 6. Product Name */}
                      <TableCell sx={{ fontWeight: 700, color: '#12262a', minWidth: 160 }}>
                        {row.product_name || row.product}
                      </TableCell>

                      {/* 7. UOM */}
                      <TableCell align="center" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>
                        {row.uom || 'PCS'}
                      </TableCell>

                      {/* 8. Stage 1 Total Qty */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 13, color: '#4338ca' }}>
                        {fmtNum(row.stage1_qty, 2)}
                      </TableCell>

                      {/* 9. Stage 2 Total Qty */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 13, color: '#6d28d9' }}>
                        {fmtNum(row.stage2_qty, 2)}
                      </TableCell>

                      {/* 10. Stage 3 Total Qty */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 13, color: '#b45309' }}>
                        {fmtNum(row.stage3_qty, 2)}
                      </TableCell>

                      {/* 11. Finished Goods Qty */}
                      <TableCell align="center" sx={{ fontWeight: 800, color: '#059669', bgcolor: '#f0fdf4', fontSize: 13 }}>
                        {fmtNum(row.finished_goods_qty, 2)}
                      </TableCell>

                      {/* 12. Rejected Qty */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: Number(row.rejected_qty) > 0 ? '#dc2626' : 'text.secondary',
                        }}
                      >
                        {fmtNum(row.rejected_qty, 2)}
                      </TableCell>

                      {/* 13. Total Production Cost */}
                      <TableCell align="right" sx={{ fontWeight: 800, color: '#0f766e', fontSize: 13.5, whiteSpace: 'nowrap' }}>
                        {fmtMoney(row.total_production_cost, 2)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            {/* Grand Total Row at Bottom */}
            {filteredRows.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 800, py: 1.5, borderTop: '2px solid #cbd5e1' } }}>
                  <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700 }}></TableCell>
                  <TableCell align="center" sx={{ color: 'text.secondary' }}></TableCell>
                  <TableCell align="center" sx={{ color: 'text.secondary' }}></TableCell>
                  <TableCell sx={{ color: '#1e293b', fontWeight: 800 }}>Grand Total</TableCell>
                  <TableCell align="center" sx={{ color: '#4338ca', fontSize: 13.5 }}>
                    {fmtNum(overall.stage1Total, 2)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#6d28d9', fontSize: 13.5 }}>
                    {fmtNum(overall.stage2Total, 2)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#b45309', fontSize: 13.5 }}>
                    {fmtNum(overall.stage3Total, 2)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#059669', bgcolor: '#dcfce7', fontSize: 14 }}>
                    {fmtNum(overall.fgTotal, 2)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#dc2626', fontSize: 13.5 }}>
                    {fmtNum(overall.rejectedTotal, 2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#0f766e', fontSize: 14, whiteSpace: 'nowrap', fontWeight: 800 }}>
                    {fmtMoney(overall.costTotal, 2)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredRows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Batch-wise Drill-down Modal (Click row to view details) */}
      <Dialog
        open={!!drilldownRow}
        onClose={() => setDrilldownRow(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f8faf9', borderBottom: '1px solid #dde5e3', py: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 750, color: '#12262a' }}>
                Batch Drill-down: {drilldownRow?.product_name}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  Product Code: <strong>{drilldownRow?.product_code || drilldownRow?.product}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">•</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  Production Code: <strong>{drilldownRow?.production_code}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">•</Typography>
                <Typography variant="caption" color="text.secondary">
                  Production Date: <strong>{fmtDate(drilldownRow?.production_date)}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">•</Typography>
                <Typography variant="caption" color="text.secondary">
                  Period: <strong>{reportingPeriodLabel}</strong>
                </Typography>
              </Stack>
            </Box>
            <IconButton onClick={() => setDrilldownRow(null)} size="small">
              <CloseRounded />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Production Batches ({drilldownRow?.batches?.length || 0})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 700 } }}>
                  <TableCell>Production Date</TableCell>
                  <TableCell>Batch Number</TableCell>
                  <TableCell>Product Code</TableCell>
                  <TableCell>Production Code</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Production Stage</TableCell>
                  <TableCell align="right">Produced Quantity</TableCell>
                  <TableCell align="right">Rejected Quantity</TableCell>
                  <TableCell align="center">Batch Status</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="right">Actual Production Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(!drilldownRow?.batches || drilldownRow.batches.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={11} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                      No direct batch details recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  drilldownRow.batches.map((b, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(b.production_date)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{b.batch_no}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{b.product_code || drilldownRow.product_code}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={b.production_code || drilldownRow.production_code}
                          sx={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, height: 18 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{b.product_name || drilldownRow.product_name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{b.stage}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: 12 }}>
                        {fmtNum(b.produced_qty, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: Number(b.rejected_qty) > 0 ? '#dc2626' : 'text.secondary', fontSize: 12 }}>
                        {fmtNum(b.rejected_qty, 2)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={b.batch_status || 'Completed'}
                          color={b.batch_status === 'Cancelled' ? 'error' : 'success'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{fmtMoney(b.unit_cost, 2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: palette.teal, fontSize: 12 }}>
                        {fmtMoney(b.production_cost, 2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Finished Goods Transfer Details */}
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Finished Goods Transfers
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 700 } }}>
                  <TableCell>Transfer Date</TableCell>
                  <TableCell>Source Stage / Batch</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell align="right">Transferred Quantity</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {drilldownRow?.finished_goods_qty > 0 ? (
                  <TableRow hover>
                    <TableCell sx={{ fontSize: 12 }}>{fmtDate(drilldownRow.production_date)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>Stage 3 / CNC Batch</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>Finished Goods Store</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: 12 }}>
                      {fmtNum(drilldownRow.finished_goods_qty, 2)} {drilldownRow.uom}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 12 }}>
                      {drilldownRow.stage3_qty > 0 ? fmtMoney(drilldownRow.total_production_cost / drilldownRow.stage3_qty, 2) : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label="Transferred" color="success" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
                      No Finished Goods transfer transactions in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
