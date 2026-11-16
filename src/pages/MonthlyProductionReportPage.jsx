import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
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
  AssignmentReturnOutlined,
  CalendarMonthOutlined,
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  ElectricBoltOutlined,
  FilterListRounded,
  Inventory2Outlined,
  LocalShippingOutlined,
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
  const pad = (n) => String(n).padStart(2, '0');
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // Default to 180 days back so both PU batches (October) and Belt batches (November) appear immediately
  const past = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const from = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-01`;
  return { from, to };
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
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 650, letterSpacing: '0.02em', textTransform: 'uppercase', fontSize: 11 }}
        >
          {label}
        </Typography>
        <Typography variant="h6" sx={{ mt: 0.5, mb: 0.25, fontWeight: 750, color: '#12262a', fontSize: '1.15rem' }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: '10px',
          bgcolor: iconBg || '#f0fdf4',
          color: iconColor || palette.teal,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
      </Box>
    </Paper>
  );
}

export default function MonthlyProductionReportPage() {
  const initialRange = useMemo(() => getInitialMonthRange(), []);

  // Filters: From Date, To Date, Product Name, Product Code, Production Code
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [productTypeFilter, setProductTypeFilter] = useState('ALL'); // 'ALL' | 'PU' | 'Belt'
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

  // 2. Fetch monthly production report aggregation from backend
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
      const res = await call('clssurya.api.get_monthly_production_report', {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        product: productSearch || undefined,
        product_code: productCodeFilter || undefined,
        production_code: productionCodeFilter || undefined,
      });
      return res || { rows: [] };
    },
    enabled: !isDateRangeInvalid,
    staleTime: 10_000,
  });

  // 3. Direct queries for Stage 1, 2, 3 batches, Dispatches, and Inventory (offline & fallback)
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

  const { data: beltBatchesList = [], refetch: refetchBeltBatches } = useQuery({
    queryKey: ['list', 'Belt Batch'],
    queryFn: () => getList('Belt Batch').catch(() => []),
    staleTime: 30 * 1000,
  });

  const { data: serverInventory = [], refetch: refetchInv } = useQuery({
    queryKey: ['list', 'Inventory'],
    queryFn: () => getList('Inventory').catch(() => []),
    staleTime: 30 * 1000,
  });

  const { data: dispatchesList = [], refetch: refetchDispatches } = useQuery({
    queryKey: ['list', 'Dispatch'],
    queryFn: () => getList('Dispatch').catch(() => []),
    staleTime: 30 * 1000,
  });

  const dispatchItemsList = [];
  const refetchDispItems = () => {};

  const { data: customerReturnsList = [], refetch: refetchReturns } = useQuery({
    queryKey: ['list', 'Customer Return'],
    queryFn: () => getList('Customer Return').catch(() => []),
    staleTime: 30 * 1000,
  });

  const customerReturnItemsList = [];
  const refetchReturnItems = () => {};

  const handleRefreshAll = () => {
    refetchDatewise();
    serverQuery.refetch();
    refetchStg1();
    refetchStg2();
    refetchStg3();
    refetchBeltBatches();
    refetchInv();
    refetchDispatches();
    refetchDispItems();
    refetchReturns();
    refetchReturnItems();
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

  // Robust client-side aggregation across batch history, dispatches, and inventory
  const computedClientRows = useMemo(() => {
    if (isDateRangeInvalid) return [];

    const normFrom = normalizeDateStr(fromDate);
    const normTo = normalizeDateStr(toDate);

    // 1. Confirmed Dispatches in Date Range
    // Rules 3 & 4: Only confirmed dispatches (dispatch_status === 'Dispatched' && docstatus !== 2)
    const confirmedDispatchesMap = new Map();
    (dispatchesList || []).forEach((d) => {
      if (d.dispatch_status === 'Dispatched' && d.docstatus !== 2) {
        const normD = normalizeDateStr(d.dispatch_date || d.creation);
        if ((!normFrom || normD >= normFrom) && (!normTo || normD <= normTo)) {
          confirmedDispatchesMap.set(d.name, d);
        }
      }
    });

    const dispatchesByProd = new Map();
    const dispatchDetailsByProd = new Map();
    (dispatchItemsList || []).forEach((item) => {
      const parentDisp = confirmedDispatchesMap.get(item.parent);
      if (parentDisp) {
        const pKey = item.product;
        const q = Number(item.quantity || 0);
        dispatchesByProd.set(pKey, (dispatchesByProd.get(pKey) || 0) + q);
        if (!dispatchDetailsByProd.has(pKey)) {
          dispatchDetailsByProd.set(pKey, []);
        }
        dispatchDetailsByProd.get(pKey).push({
          dispatch_no: parentDisp.name || '',
          dispatch_date: normalizeDateStr(parentDisp.dispatch_date || parentDisp.creation),
          customer: parentDisp.customer || '',
          sales_order: parentDisp.sales_order || '',
          quantity: q,
          unit_cost: Number(item.unit_cost || 0),
        });
      }
    });

    // 1b. Confirmed Customer Returns in Date Range
    const confirmedReturnsMap = new Map();
    (customerReturnsList || []).forEach((r) => {
      if (r.return_status === 'Confirmed' && r.docstatus !== 2) {
        const normD = normalizeDateStr(r.return_date || r.creation);
        if ((!normFrom || normD >= normFrom) && (!normTo || normD <= normTo)) {
          confirmedReturnsMap.set(r.name, r);
        }
      }
    });

    const returnsByProd = new Map();
    const returnDetailsByProd = new Map();
    (customerReturnItemsList || []).forEach((item) => {
      const parentRet = confirmedReturnsMap.get(item.parent);
      if (parentRet) {
        const pKey = item.product;
        const q = Number(item.return_qty || item.quantity || 0);
        returnsByProd.set(pKey, (returnsByProd.get(pKey) || 0) + q);
        if (!returnDetailsByProd.has(pKey)) {
          returnDetailsByProd.set(pKey, []);
        }
        returnDetailsByProd.get(pKey).push({
          return_no: parentRet.name || '',
          return_date: normalizeDateStr(parentRet.return_date || parentRet.creation),
          customer: parentRet.customer || '',
          dispatch: parentRet.dispatch || '',
          sales_order: parentRet.sales_order || '',
          return_qty: q,
          condition: item.condition || 'Usable',
        });
      }
    });

    // 2. Available stock in inventory (Finished goods stock)
    // Rule 7: Keep current available inventory separate from production totals
    const stockByProd = new Map();
    const inventoryBreakdown = new Map();
    (serverInventory || []).forEach((inv) => {
      const pKey = inv.product || inv.name;
      const stg = inv.stage || toInternalStage(inv.stage) || '';
      const stk = Number(inv.stock || 0);
      if (!inventoryBreakdown.has(pKey)) {
        inventoryBreakdown.set(pKey, {});
      }
      inventoryBreakdown.get(pKey)[stg] = stk;
      if (stg === 'Finished') {
        stockByProd.set(pKey, (stockByProd.get(pKey) || 0) + stk);
      }
    });

    // 3. Gather completed batches in date range
    // Rules 4 & 5: Do not count pending or unconfirmed batches as completed production
    const allBatches = [];
    const seenBatchKeys = new Set();

    const addBatch = (b, stageNum, stageLabel) => {
      if (!b) return;
      if (b.docstatus === 2) return;
      // Belt Batch has no 'status' column, only is_completed; PU Stage batches have both
      if (b.status === 'Cancelled') return;
      const isCompleted = b.is_completed === 1 || b.is_completed === true || b.status === 'Completed';
      if (!isCompleted) return;

      const rawDt = b.production_date || b.posting_date || b.modified || b.creation || '';
      const normDt = normalizeDateStr(rawDt);
      if (normFrom && normDt && normDt < normFrom) return;
      if (normTo && normDt && normDt > normTo) return;

      const batchKey = `${stageNum}_${b.name || b.batch_no || ''}_${normDt}_${b.product || b.product_code || ''}`;
      if (seenBatchKeys.has(batchKey)) return;
      seenBatchKeys.add(batchKey);

      allBatches.push({
        ...b,
        stage_num: stageNum,
        stage_label: stageLabel,
        batch_no: b.batch_no || b.name || '',
        production_date: normDt || rawDt,
      });
    };

    (stage1Batches || []).forEach((b) => addBatch(b, 1, 'Stage 1 – Insert Making'));
    (stage2Batches || []).forEach((b) => addBatch(b, 2, 'Stage 2 – PU & Casting'));
    (stage3Batches || []).forEach((b) => addBatch(b, 3, 'Stage 3 – CNC'));
    (beltBatchesList || []).forEach((b) => {
      const step = Number(b.process_step) || Number(String(b.stage || '').replace(/\D/g, '')) || 1;
      const label = step === 1 ? 'Stage 1 – Roll Creation' : step === 2 ? 'Stage 2 – Roll Sizing' : step === 3 ? 'Stage 3 – Roll Finished' : 'Stage 4 – Charges';
      addBatch(b, step, label);
    });

    // 4. Aggregate batches into product rows
    const groups = {};

    allBatches.forEach((b) => {
      const prodIdentifier = b.product || b.product_code || b.product_name || '';
      if (!prodIdentifier) return;

      const p = prodMap.get(prodIdentifier) || prodMap.get(b.product_name) || {};
      const prodCode = p.product_code || b.product_code || prodIdentifier || '—';
      const prodName = p.product_name || b.product_name || prodIdentifier || '—';
      const uom = p.uom || b.uom || 'PCS';
      const totalSteps = Number(p.total_steps || 3);
      const prodCodeCandidate = b.production_code || p.production_code || '—';

      const groupKey = prodIdentifier;

      let monthNo = 1;
      const normDt = b.production_date;
      if (normDt) {
        const parts = normDt.split('-');
        if (parts[1]) monthNo = parseInt(parts[1], 10);
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          month_no: monthNo,
          production_date: normDt,
          product: prodIdentifier,
          product_code: prodCode,
          production_code: prodCodeCandidate,
          product_name: prodName,
          uom: uom,
          total_steps: totalSteps,
          stage1_qty: 0,
          stage2_qty: 0,
          stage3_qty: 0,
          stage4_qty: 0,
          total_produced_qty: 0,
          finished_goods_qty: 0,
          dispatched_qty: 0,
          return_qty: 0,
          available_stock: 0,
          rejected_qty: 0,
          total_production_cost: 0,
          batch_count: 0,
          batches: [],
          dispatches: [],
          returns: [],
          inventory_breakdown: {},
        };
      }

      const g = groups[groupKey];
      if (normDt && (!g.production_date || normDt > normalizeDateStr(g.production_date))) {
        g.production_date = normDt;
        const parts = normDt.split('-');
        if (parts[1]) g.month_no = parseInt(parts[1], 10);
      }

      const qty = Number(b.quantity || b.produced_qty || b.accepted_qty) || 0;
      const rejPct = Number(b.rejection_percent) || 0;
      const rejQty = Number(b.rejected_qty) > 0 ? Number(b.rejected_qty) : (qty * rejPct) / 100;

      const bTotal = Number(b.batch_total) || 0;
      const carried = Number(b.carried_cost) || 0;
      const added = Number(b.added_cost) || 0;
      const unitCost = Number(b.unit_cost) || 0;

      let netCost = 0;
      if (b.stage_num === 1) {
        netCost = bTotal > 0 ? bTotal : added;
      } else if (b.stage_num === 2) {
        netCost = (carried > 0 && bTotal >= carried) ? (bTotal - carried) : (added > 0 ? added : bTotal);
      } else {
        netCost = (carried > 0 && bTotal >= carried) ? (bTotal - carried) : (added > 0 ? added : bTotal);
      }

      if (b.stage_num === 1) g.stage1_qty += qty;
      else if (b.stage_num === 2) g.stage2_qty += qty;
      else if (b.stage_num === 3) g.stage3_qty += qty;
      else if (b.stage_num === 4) g.stage4_qty += qty;

      g.rejected_qty += rejQty;
      g.total_production_cost += netCost;
      g.batch_count += 1;

      g.batches.push({
        production_date: normDt,
        batch_no: b.batch_no || b.name || '',
        product_code: prodCode,
        production_code: g.production_code,
        product_name: prodName,
        stage: b.stage_label || `Stage ${b.stage_num}`,
        produced_qty: qty,
        rejected_qty: rejQty,
        batch_status: b.status || 'Completed',
        production_cost: bTotal > 0 ? bTotal : netCost,
        unit_cost: unitCost > 0 ? unitCost : (qty > 0 ? netCost / qty : 0),
      });
    });

    // 5. Also include products with dispatches or returns in date range even if production was earlier
    dispatchesByProd.forEach((dispQty, pId) => {
      if (!groups[pId]) {
        const p = prodMap.get(pId) || {};
        const pCode = p.product_code || pId;
        const pName = p.product_name || pId;
        const totalSteps = Number(p.total_steps || 3);
        const avail = stockByProd.get(pId) || stockByProd.get(pCode) || 0;
        groups[pId] = {
          month_no: 1,
          production_date: normTo || normFrom || '',
          product: pId,
          product_code: pCode,
          production_code: p.production_code || '—',
          product_name: pName,
          uom: p.uom || 'PCS',
          total_steps: totalSteps,
          stage1_qty: 0,
          stage2_qty: 0,
          stage3_qty: 0,
          stage4_qty: 0,
          total_produced_qty: 0,
          finished_goods_qty: 0,
          dispatched_qty: dispQty,
          return_qty: returnsByProd.get(pId) || returnsByProd.get(pCode) || 0,
          available_stock: avail,
          rejected_qty: 0,
          total_production_cost: 0,
          batch_count: 0,
          batches: [],
          dispatches: dispatchDetailsByProd.get(pId) || [],
          returns: returnDetailsByProd.get(pId) || returnDetailsByProd.get(pCode) || [],
          inventory_breakdown: inventoryBreakdown.get(pId) || {},
        };
      }
    });

    returnsByProd.forEach((retQty, pId) => {
      if (!groups[pId]) {
        const p = prodMap.get(pId) || {};
        const pCode = p.product_code || pId;
        const pName = p.product_name || pId;
        const totalSteps = Number(p.total_steps || 3);
        const avail = stockByProd.get(pId) || stockByProd.get(pCode) || 0;
        groups[pId] = {
          month_no: 1,
          production_date: normTo || normFrom || '',
          product: pId,
          product_code: pCode,
          production_code: p.production_code || '—',
          product_name: pName,
          uom: p.uom || 'PCS',
          total_steps: totalSteps,
          stage1_qty: 0,
          stage2_qty: 0,
          stage3_qty: 0,
          stage4_qty: 0,
          total_produced_qty: 0,
          finished_goods_qty: 0,
          dispatched_qty: 0,
          return_qty: retQty,
          available_stock: avail,
          rejected_qty: 0,
          total_production_cost: 0,
          batch_count: 0,
          batches: [],
          dispatches: [],
          returns: returnDetailsByProd.get(pId) || returnDetailsByProd.get(pCode) || [],
          inventory_breakdown: inventoryBreakdown.get(pId) || {},
        };
      }
    });

    // 6. Finalize calculations: Total Produced, Dispatched, Return Qty, Available Stock
    const result = Object.values(groups);
    result.forEach((g) => {
      const pId = g.product;
      const pCode = g.product_code;
      const p = prodMap.get(pId) || prodMap.get(pCode) || {};

      // Rule 8: calculate total finished production from the final completed production stage
      // For Belt products (4-stage), use highest non-zero stage working backwards from stage4
      const totalSteps = Number(g.total_steps || 3);
      const isBeltProduct =
        g.stage4_qty > 0 ||
        g.batches?.some((b) => b.stage?.includes('Roll') || b.stage_label?.includes('Roll') || b.stage_label?.includes('Charges')) ||
        p.finished_good_type === 'Belt' ||
        String(pId).toLowerCase().includes('belt') ||
        String(pCode).toLowerCase().includes('belt');
      g.is_belt = Boolean(isBeltProduct);
      let totalProduced = 0;
      if (isBeltProduct) {
        // Belt: use the last completed stage (4→3→2→1)
        totalProduced = g.stage4_qty > 0 ? g.stage4_qty : (g.stage3_qty > 0 ? g.stage3_qty : (g.stage2_qty > 0 ? g.stage2_qty : g.stage1_qty));
      } else if (totalSteps === 1) {
        totalProduced = g.stage1_qty;
      } else if (totalSteps === 2) {
        totalProduced = g.stage2_qty;
      } else {
        totalProduced = g.stage3_qty;
      }
      g.total_produced_qty = totalProduced;
      g.finished_goods_qty = totalProduced;

      g.dispatched_qty = dispatchesByProd.get(pId) || dispatchesByProd.get(pCode) || 0;
      g.dispatches = dispatchDetailsByProd.get(pId) || dispatchDetailsByProd.get(pCode) || [];

      g.return_qty = returnsByProd.get(pId) || returnsByProd.get(pCode) || 0;
      g.returns = returnDetailsByProd.get(pId) || returnDetailsByProd.get(pCode) || [];

      // Available stock
      let avail = stockByProd.get(pId) ?? stockByProd.get(pCode);
      if (avail === undefined || avail === null) {
        const finalKey = `Stage ${totalSteps}`;
        avail = inventoryBreakdown.get(pId)?.[finalKey] ?? 0;
      }
      g.available_stock = Number(avail || 0);
      g.inventory_breakdown = inventoryBreakdown.get(pId) || {};
    });

    return result.sort((a, b) => {
      const dA = normalizeDateStr(a.production_date);
      const dB = normalizeDateStr(b.production_date);
      if (dA !== dB) return dB.localeCompare(dA);
      return a.product_name.localeCompare(b.product_name);
    });
  }, [
    stage1Batches,
    stage2Batches,
    stage3Batches,
    beltBatchesList,
    dispatchesList,
    dispatchItemsList,
    customerReturnsList,
    customerReturnItemsList,
    serverInventory,
    prodMap,
    fromDate,
    toDate,
    isDateRangeInvalid,
  ]);

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

        const stage1Qty = Number(r.stage1_qty ?? 0);
        const stage2Qty = Number(r.stage2_qty ?? 0);
        const stage3Qty = Number(r.stage3_qty ?? 0);
        const stage4Qty = Number(r.stage4_qty ?? 0);
        const totalSteps = Number(r.total_steps ?? p.total_steps ?? 3);

        // Rule 8: calculate total finished production from the final completed production stage
        let totalProduced = Number(r.total_produced_qty ?? r.finished_goods_qty ?? 0);
        if (totalProduced === 0 && (stage1Qty > 0 || stage2Qty > 0 || stage3Qty > 0 || stage4Qty > 0)) {
          if (stage4Qty > 0) totalProduced = stage4Qty;
          else if (totalSteps === 1) totalProduced = stage1Qty;
          else if (totalSteps === 2) totalProduced = stage2Qty;
          else totalProduced = stage3Qty;
        }

        return {
          ...r,
          month_no: mNo || 1,
          production_date: normDt || r.production_date,
          product: prodId,
          product_code: r.product_code || p.product_code || prodId || '—',
          production_code:
            r.production_code && r.production_code !== '—'
              ? r.production_code
              : p.production_code || '—',
          product_name: r.product_name || p.product_name || prodId || '—',
          uom: r.uom || p.uom || 'PCS',
          total_steps: totalSteps,
          is_belt: Boolean(
            r.is_belt ||
            p.finished_good_type === 'Belt' ||
            prodId.toLowerCase().includes('belt') ||
            stage4Qty > 0 ||
            r.batches?.some((b) => b.stage?.includes('Roll') || b.stage_label?.includes('Roll') || b.stage_label?.includes('Charges'))
          ),
          stage1_qty: stage1Qty,
          stage2_qty: stage2Qty,
          stage3_qty: stage3Qty,
          stage4_qty: stage4Qty,
          total_produced_qty: totalProduced,
          finished_goods_qty: totalProduced,
          dispatched_qty: Number(r.dispatched_qty ?? r.total_dispatched_qty ?? 0),
          return_qty: Number(r.return_qty ?? r.customer_return_qty ?? 0),
          available_stock: Number(r.available_stock ?? 0),
          rejected_qty: Number(r.rejected_qty ?? 0),
          total_production_cost: Number(r.total_production_cost ?? 0),
          batches: r.batches || [],
          dispatches: r.dispatches || [],
          returns: r.returns || [],
          inventory_breakdown: r.inventory_breakdown || {},
        };
      });
    }
    return computedClientRows;
  }, [serverQuery.data, computedClientRows, prodMap]);

  // Apply search/code filters
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (productTypeFilter === 'PU' && r.is_belt) return false;
      if (productTypeFilter === 'Belt' && !r.is_belt) return false;
      if (productSearch.trim()) {
        const q = productSearch.trim().toLowerCase();
        const pName = (r.product_name || r.product || '').toLowerCase();
        const pCode = (r.product_code || '').toLowerCase();
        if (!pName.includes(q) && !pCode.includes(q)) return false;
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
  }, [allRows, productSearch, productCodeFilter, productionCodeFilter, productTypeFilter]);

  // Overall totals across filtered rows
  const overall = useMemo(() => {
    let stage1Total = 0,
      stage2Total = 0,
      stage3Total = 0,
      stage4Total = 0,
      totalProduced = 0,
      totalDispatched = 0,
      returnTotal = 0,
      availableStock = 0,
      rejectedTotal = 0,
      costTotal = 0;

    filteredRows.forEach((r) => {
      stage1Total += Number(r.stage1_qty) || 0;
      stage2Total += Number(r.stage2_qty) || 0;
      stage3Total += Number(r.stage3_qty) || 0;
      stage4Total += Number(r.stage4_qty) || 0;
      totalProduced += Number(r.total_produced_qty) || 0;
      totalDispatched += Number(r.dispatched_qty) || 0;
      returnTotal += Number(r.return_qty) || 0;
      availableStock += Number(r.available_stock) || 0;
      rejectedTotal += Number(r.rejected_qty) || 0;
      costTotal += Number(r.total_production_cost) || 0;
    });

    return {
      stage1Total,
      stage2Total,
      stage3Total,
      stage4Total,
      totalProduced,
      totalDispatched,
      returnTotal,
      availableStock,
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

  const uniqueUoms = useMemo(() => {
    return [...new Set(filteredRows.map((r) => r.uom).filter(Boolean))];
  }, [filteredRows]);

  const primaryUom = useMemo(() => {
    if (uniqueUoms.length === 1) return uniqueUoms[0];
    const qtyProducts = filteredRows.filter(
      (r) => (r.uom || '').toUpperCase() === 'QTY' || (r.uom || '').toUpperCase() === 'PCS'
    );
    if (qtyProducts.length > 0) return 'QTY';
    return uniqueUoms[0] || 'QTY';
  }, [uniqueUoms, filteredRows]);

  const uomTotals = useMemo(() => {
    let qtyProduced = 0, mtrProduced = 0;
    let qtyDispatched = 0, mtrDispatched = 0;
    let qtyReturned = 0, mtrReturned = 0;
    let qtyStock = 0, mtrStock = 0;
    let qtyStage1 = 0, mtrStage1 = 0;
    let qtyStage2 = 0, mtrStage2 = 0;
    let qtyStage3 = 0, mtrStage3 = 0;

    filteredRows.forEach((r) => {
      const u = (r.uom || '').toUpperCase();
      const isMtr = u === 'MTR' || u === 'METER' || u === 'METERS';
      const prod = Number(r.total_produced_qty) || 0;
      const disp = Number(r.dispatched_qty) || 0;
      const ret = Number(r.return_qty) || 0;
      const stk = Number(r.available_stock) || 0;
      const s1 = Number(r.stage1_qty) || 0;
      const s2 = Number(r.stage2_qty) || 0;
      const s3 = Number(r.stage3_qty) || 0;

      if (isMtr) {
        mtrProduced += prod;
        mtrDispatched += disp;
        mtrReturned += ret;
        mtrStock += stk;
        mtrStage1 += s1;
        mtrStage2 += s2;
        mtrStage3 += s3;
      } else {
        qtyProduced += prod;
        qtyDispatched += disp;
        qtyReturned += ret;
        qtyStock += stk;
        qtyStage1 += s1;
        qtyStage2 += s2;
        qtyStage3 += s3;
      }
    });

    return {
      qtyProduced,
      mtrProduced,
      qtyDispatched,
      mtrDispatched,
      qtyReturned,
      mtrReturned,
      qtyStock,
      mtrStock,
      qtyStage1,
      mtrStage1,
      qtyStage2,
      mtrStage2,
      qtyStage3,
      mtrStage3,
    };
  }, [filteredRows]);

  // Export to CSV with all required columns
  const handleExportCSV = () => {
    if (!filteredRows.length) return;
    const headers = [
      '#',
      'Product Code',
      'Product Name',
      'UOM',
      'Stage 1 Produced Qty',
      'Stage 2 Produced Qty',
      'Stage 3 Produced Qty',
      'Stage 4 Produced Qty (Belt)',
      'Total Produced Qty',
      'Total Dispatched Qty',
      'Return Qty',
      'Remaining Available Inventory',
      'Rejected Qty',
      'Total Production Cost',
    ];

    const csvRows = filteredRows.map((r, i) => [
      i + 1,
      `"${r.product_code || ''}"`,
      `"${r.product_name || ''}"`,
      `"${r.uom || 'PCS'}"`,
      r.stage1_qty || 0,
      r.stage2_qty || 0,
      r.stage3_qty || 0,
      r.stage4_qty || 0,
      r.total_produced_qty || 0,
      r.dispatched_qty || 0,
      r.return_qty || 0,
      r.available_stock || 0,
      r.rejected_qty || 0,
      r.total_production_cost || 0,
    ]);

    // Append Grand Total Row to CSV
    csvRows.push([
      'Total',
      '',
      '"Grand Total"',
      `"${uomTotals.mtrProduced > 0 && uomTotals.qtyProduced > 0 ? 'QTY + MTR' : primaryUom}"`,
      overall.stage1Total,
      overall.stage2Total,
      overall.stage3Total,
      overall.stage4Total,
      overall.totalProduced,
      overall.totalDispatched,
      overall.returnTotal,
      overall.availableStock,
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ mb: 3, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>
              Monthly Production Report
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Total quantities produced, confirmed dispatches, return quantities, and available stock.
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

      {/* Backend API Error Alert */}
      {serverQuery.isError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '10px' }}>
          <strong>Error loading production report from server:</strong>{' '}
          {serverQuery.error?.message || 'Server connection failed'}. Displaying locally synchronized offline data.
        </Alert>
      )}

      {/* 6 Summary Stat Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(6, 1fr)',
          },
          gap: 1.5,
          mb: 3,
        }}
      >
        <StatCard
          label="Total Produced"
          value={
            uomTotals.qtyProduced > 0 && uomTotals.mtrProduced > 0
              ? `${fmtNum(uomTotals.qtyProduced, 0)} QTY`
              : uomTotals.qtyProduced > 0
              ? `${fmtNum(uomTotals.qtyProduced, 0)} ${primaryUom}`
              : `${fmtNum(uomTotals.mtrProduced, 0)} MTR`
          }
          subtitle={
            uomTotals.qtyProduced > 0 && uomTotals.mtrProduced > 0
              ? `+ ${fmtNum(uomTotals.mtrProduced, 0)} MTR (Roll)`
              : uomTotals.qtyProduced > 0
              ? 'Final completed output'
              : 'Roll creation output'
          }
          icon={CheckCircleOutlineRounded}
          iconBg="#ecfdf5"
          iconColor="#059669"
        />
        <StatCard
          label="Total Dispatched"
          value={
            uomTotals.qtyDispatched > 0 && uomTotals.mtrDispatched > 0
              ? `${fmtNum(uomTotals.qtyDispatched, 0)} QTY`
              : `${fmtNum(overall.totalDispatched, 0)} ${primaryUom}`
          }
          subtitle={
            uomTotals.qtyDispatched > 0 && uomTotals.mtrDispatched > 0
              ? `+ ${fmtNum(uomTotals.mtrDispatched, 0)} MTR`
              : 'Confirmed dispatches'
          }
          icon={LocalShippingOutlined}
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
        <StatCard
          label="Total Returned"
          value={
            uomTotals.qtyReturned > 0 && uomTotals.mtrReturned > 0
              ? `${fmtNum(uomTotals.qtyReturned, 0)} QTY`
              : `${fmtNum(overall.returnTotal, 0)} ${primaryUom}`
          }
          subtitle={
            uomTotals.qtyReturned > 0 && uomTotals.mtrReturned > 0
              ? `+ ${fmtNum(uomTotals.mtrReturned, 0)} MTR`
              : 'Customer returns'
          }
          icon={AssignmentReturnOutlined}
          iconBg="#fffbeb"
          iconColor="#d97706"
        />
        <StatCard
          label="Stage 1 Produced"
          value={
            uomTotals.qtyStage1 > 0 && uomTotals.mtrStage1 > 0
              ? `${fmtNum(uomTotals.qtyStage1, 0)} QTY`
              : uomTotals.qtyStage1 > 0
              ? `${fmtNum(uomTotals.qtyStage1, 0)} QTY`
              : `${fmtNum(uomTotals.mtrStage1, 0)} MTR`
          }
          subtitle={
            uomTotals.qtyStage1 > 0 && uomTotals.mtrStage1 > 0
              ? `+ ${fmtNum(uomTotals.mtrStage1, 0)} MTR (Roll Creation)`
              : uomTotals.qtyStage1 > 0
              ? 'Insert making output'
              : 'Roll creation output'
          }
          icon={PrecisionManufacturingOutlined}
          iconBg="#eef2ff"
          iconColor="#4338ca"
        />
        <StatCard
          label="Stage 2 Produced"
          value={
            uomTotals.qtyStage2 > 0 && uomTotals.mtrStage2 > 0
              ? `${fmtNum(uomTotals.qtyStage2, 0)} QTY`
              : uomTotals.qtyStage2 > 0
              ? `${fmtNum(uomTotals.qtyStage2, 0)} QTY`
              : `${fmtNum(overall.stage2Total, 0)} ${primaryUom}`
          }
          subtitle={
            uomTotals.qtyStage2 > 0 && uomTotals.mtrStage2 > 0
              ? `+ ${fmtNum(uomTotals.mtrStage2, 0)} MTR`
              : 'PU casting & Roll sizing'
          }
          icon={TuneOutlined}
          iconBg="#f5f3ff"
          iconColor="#6d28d9"
        />
        <StatCard
          label="Stage 3 Produced"
          value={
            uomTotals.qtyStage3 > 0 && uomTotals.mtrStage3 > 0
              ? `${fmtNum(uomTotals.qtyStage3, 0)} QTY`
              : uomTotals.qtyStage3 > 0
              ? `${fmtNum(uomTotals.qtyStage3, 0)} QTY`
              : `${fmtNum(overall.stage3Total, 0)} ${primaryUom}`
          }
          subtitle={
            uomTotals.qtyStage3 > 0 && uomTotals.mtrStage3 > 0
              ? `+ ${fmtNum(uomTotals.mtrStage3, 0)} MTR`
              : 'CNC & Roll finished output'
          }
          icon={ElectricBoltOutlined}
          iconBg="#fffbeb"
          iconColor="#b45309"
        />
      </Box>

      {/* Report Filters */}
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
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Chip
              label="All Products"
              size="small"
              color={productTypeFilter === 'ALL' ? 'primary' : 'default'}
              variant={productTypeFilter === 'ALL' ? 'filled' : 'outlined'}
              onClick={() => setProductTypeFilter('ALL')}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            />
            <Chip
              label="PU Products"
              size="small"
              color={productTypeFilter === 'PU' ? 'primary' : 'default'}
              variant={productTypeFilter === 'PU' ? 'filled' : 'outlined'}
              onClick={() => setProductTypeFilter('PU')}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            />
            <Chip
              label="Belt Products"
              size="small"
              color={productTypeFilter === 'Belt' ? 'primary' : 'default'}
              variant={productTypeFilter === 'Belt' ? 'filled' : 'outlined'}
              onClick={() => setProductTypeFilter('Belt')}
              sx={{ cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            />
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', gap: 1 }}
          >
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

            {/* Filter 3: Product Search */}
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" sx={{ fontWeight: 650, color: 'text.secondary', mb: 0.3, display: 'block' }}>
                Product Name / Code
              </Typography>
              <TextField
                placeholder="Search product name or code…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                size="small"
                fullWidth
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
      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#ffffff' }}>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow
                sx={{
                  '& th': {
                    bgcolor: '#f8fafc',
                    fontWeight: 700,
                    color: '#475569',
                    whiteSpace: 'nowrap',
                    py: 1.25,
                    px: 0.75,
                    fontSize: '0.75rem',
                  },
                }}
              >
                {/* 1. Row Counter */}
                <TableCell align="center" sx={{ width: 35, px: 0.5 }}>#</TableCell>
                {/* 2. Product Code */}
                <TableCell sx={{ minWidth: 85, px: 0.75 }}>Product Code</TableCell>
                {/* 3. Product Name */}
                <TableCell sx={{ minWidth: 140, px: 0.75 }}>Product Name</TableCell>
                {/* 4. Stage 1 Produced Quantity */}
                <TableCell align="center" sx={{ color: '#4338ca', minWidth: 60, px: 0.5 }}>
                  Stage 1
                </TableCell>
                {/* 5. Stage 2 Produced Quantity */}
                <TableCell align="center" sx={{ color: '#6d28d9', minWidth: 60, px: 0.5 }}>
                  Stage 2
                </TableCell>
                {/* 6. Stage 3 Produced Quantity */}
                <TableCell align="center" sx={{ color: '#b45309', minWidth: 60, px: 0.5 }}>
                  Stage 3
                </TableCell>
                {/* 6b. Stage 4 Produced Quantity (Belt) */}
                <TableCell align="center" sx={{ color: '#0284c7', minWidth: 60, px: 0.5 }}>
                  Stage 4
                </TableCell>
                {/* 7. Total Produced Quantity */}
                <TableCell
                  align="center"
                  sx={{
                    color: '#059669',
                    bgcolor: '#f0fdf4 !important',
                    fontWeight: 800,
                    minWidth: 75,
                    px: 0.5,
                  }}
                >
                  Total Produced
                </TableCell>
                {/* 8. Total Dispatched/Sold Quantity */}
                <TableCell
                  align="center"
                  sx={{
                    color: '#2563eb',
                    bgcolor: '#eff6ff !important',
                    fontWeight: 800,
                    minWidth: 70,
                    px: 0.5,
                  }}
                >
                  Total Dis.
                </TableCell>
                {/* 9. Return Quantity */}
                <TableCell
                  align="center"
                  sx={{
                    color: '#d97706',
                    bgcolor: '#fffbeb !important',
                    fontWeight: 800,
                    minWidth: 70,
                    px: 0.5,
                  }}
                >
                  Return Qty
                </TableCell>
                {/* 10. Remaining Available Inventory */}
                <TableCell
                  align="center"
                  sx={{
                    color: '#0f766e',
                    bgcolor: '#f0fdfa !important',
                    fontWeight: 800,
                    minWidth: 75,
                    px: 0.5,
                  }}
                >
                  Available Stock
                </TableCell>
                {/* 11. Rejected Qty */}
                <TableCell align="center" sx={{ color: '#dc2626', minWidth: 60, px: 0.5 }}>
                  Rej. Qty
                </TableCell>
                {/* 12. Total Production Cost */}
                <TableCell align="right" sx={{ color: '#0f766e', fontWeight: 800, minWidth: 90, px: 0.75 }}>
                  Total Cost
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((__, j) => (
                      <TableCell key={j} sx={{ py: 1, px: 0.75 }}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} sx={{ py: 6, textAlign: 'center' }}>
                    <CalendarMonthOutlined sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      No production data recorded
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      No completed production batches or dispatches found matching your selected date range and filters.
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
                      {/* 1. Row Counter */}
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 12, px: 0.5 }}>
                        {rowNumber}
                      </TableCell>

                      {/* 2. Product Code */}
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155', fontSize: 12, px: 0.75 }}>
                        {row.product_code || row.product}
                      </TableCell>

                      {/* 3. Product Name */}
                      <TableCell sx={{ fontWeight: 750, color: '#12262a', minWidth: 160, px: 0.75 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <span>{row.product_name || row.product}</span>
                          <Chip
                            label={row.is_belt ? 'Belt' : 'PU'}
                            size="small"
                            color={row.is_belt ? 'secondary' : 'primary'}
                            variant="outlined"
                            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                          />
                          <Chip
                            label={row.uom || (row.is_belt && String(row.product_code || row.product).includes('ROLL') ? 'MTR' : 'QTY')}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: 10, fontWeight: 700, color: '#475569', borderColor: '#cbd5e1' }}
                          />
                        </Stack>
                      </TableCell>

                      {/* 4. Stage 1 Produced Quantity */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12.5, color: '#4338ca', px: 0.5 }}>
                        {fmtNum(row.stage1_qty, 3)}
                      </TableCell>

                      {/* 5. Stage 2 Produced Quantity */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12.5, color: '#6d28d9', px: 0.5 }}>
                        {fmtNum(row.stage2_qty, 3)}
                      </TableCell>

                      {/* 6. Stage 3 Produced Quantity */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12.5, color: '#b45309', px: 0.5 }}>
                        {fmtNum(row.stage3_qty, 3)}
                      </TableCell>

                      {/* 6b. Stage 4 Produced Quantity (Belt) */}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12.5, color: '#0284c7', px: 0.5 }}>
                        {row.stage4_qty > 0 ? fmtNum(row.stage4_qty, 3) : (row.is_belt ? '0' : '—')}
                      </TableCell>

                      {/* 7. Total Produced Quantity */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 800,
                          color: '#059669',
                          bgcolor: '#f0fdf4',
                          fontSize: 13,
                          px: 0.5,
                        }}
                      >
                        {fmtNum(row.total_produced_qty, 3)}
                      </TableCell>

                      {/* 8. Total Dispatched/Sold Quantity */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 800,
                          color: '#2563eb',
                          bgcolor: '#eff6ff',
                          fontSize: 13,
                          px: 0.5,
                        }}
                      >
                        {fmtNum(row.dispatched_qty, 3)}
                      </TableCell>

                      {/* 9. Return Quantity */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 800,
                          color: '#d97706',
                          bgcolor: '#fffbeb',
                          fontSize: 13,
                          px: 0.5,
                        }}
                      >
                        {fmtNum(row.return_qty, 3)}
                      </TableCell>

                      {/* 10. Remaining Available Inventory */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 800,
                          color: '#0f766e',
                          bgcolor: '#f0fdfa',
                          fontSize: 13,
                          px: 0.5,
                        }}
                      >
                        {fmtNum(row.available_stock, 3)}
                      </TableCell>

                      {/* 11. Rejected Qty */}
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: Number(row.rejected_qty) > 0 ? '#dc2626' : 'text.secondary',
                          px: 0.5,
                        }}
                      >
                        {fmtNum(row.rejected_qty, 3)}
                      </TableCell>

                      {/* 12. Total Production Cost */}
                      <TableCell align="right" sx={{ fontWeight: 800, color: '#0f766e', fontSize: 13, whiteSpace: 'nowrap', px: 0.75 }}>
                        {fmtMoney(row.total_production_cost, 3)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            {/* Grand Total Row at Bottom */}
            {filteredRows.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 800, py: 1.25, borderTop: '2px solid #cbd5e1' } }}>
                  <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 700, px: 0.5 }}></TableCell>
                  <TableCell sx={{ color: '#1e293b', fontWeight: 800, px: 0.75 }} colSpan={2}>
                    Grand Total
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#4338ca', fontSize: 13, px: 0.5 }}>
                    {fmtNum(overall.stage1Total, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#6d28d9', fontSize: 13, px: 0.5 }}>
                    {fmtNum(overall.stage2Total, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#b45309', fontSize: 13, px: 0.5 }}>
                    {fmtNum(overall.stage3Total, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#0284c7', fontSize: 13, px: 0.5 }}>
                    {fmtNum(overall.stage4Total, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#059669', bgcolor: '#dcfce7 !important', fontSize: 13.5, px: 0.5 }}>
                    {fmtNum(overall.totalProduced, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#1d4ed8', bgcolor: '#dbeafe !important', fontSize: 13.5, px: 0.5 }}>
                    {fmtNum(overall.totalDispatched, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#d97706', bgcolor: '#fef3c7 !important', fontSize: 13.5, px: 0.5 }}>
                    {fmtNum(overall.returnTotal, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#0f766e', bgcolor: '#ccfbf1 !important', fontSize: 13.5, px: 0.5 }}>
                    {fmtNum(overall.availableStock, 3)}
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#dc2626', fontSize: 13, px: 0.5 }}>
                    {fmtNum(overall.rejectedTotal, 3)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#0f766e', fontSize: 13.5, whiteSpace: 'nowrap', fontWeight: 800, px: 0.75 }}>
                    {fmtMoney(overall.costTotal, 3)}
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

      {/* Batch & Dispatch Drill-down Modal */}
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
                Production & Dispatch Details: {drilldownRow?.product_name}
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
          {/* Top Quick KPI Strip */}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              mb: 3,
              borderRadius: '12px',
              bgcolor: '#f8faf9',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              justifyContent: 'space-around',
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                STAGE 1 PRODUCED
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#4338ca' }}>
                {fmtNum(drilldownRow?.stage1_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                STAGE 2 PRODUCED
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#6d28d9' }}>
                {fmtNum(drilldownRow?.stage2_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                STAGE 3 PRODUCED
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#b45309' }}>
                {fmtNum(drilldownRow?.stage3_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                TOTAL PRODUCED
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#059669' }}>
                {fmtNum(drilldownRow?.total_produced_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                TOTAL DISPATCHED
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#2563eb' }}>
                {fmtNum(drilldownRow?.dispatched_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                RETURN QTY
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#d97706' }}>
                {fmtNum(drilldownRow?.return_qty, 2)} {drilldownRow?.uom}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
                AVAILABLE STOCK
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f766e' }}>
                {fmtNum(drilldownRow?.available_stock, 3)} {drilldownRow?.uom}
              </Typography>
            </Box>
          </Paper>

          {/* Section 1: Production Batches */}
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Completed Production Batches ({drilldownRow?.batches?.length || 0})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 700 } }}>
                  <TableCell>Production Date</TableCell>
                  <TableCell>Batch Number</TableCell>
                  <TableCell>Production Stage</TableCell>
                  <TableCell align="right">Produced Quantity</TableCell>
                  <TableCell align="right">Rejected Quantity</TableCell>
                  <TableCell align="center">Batch Status</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="right">Production Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(!drilldownRow?.batches || drilldownRow.batches.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', py: 2.5, color: 'text.secondary' }}>
                      No completed production batches recorded in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  drilldownRow.batches.map((b, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(b.production_date)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{b.batch_no}</TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{b.stage}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', fontSize: 12 }}>
                        {fmtNum(b.produced_qty, 2)} {drilldownRow.uom}
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

          {/* Section 2: Confirmed Dispatches */}
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Confirmed Dispatches in Period ({drilldownRow?.dispatches?.length || 0})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 700 } }}>
                  <TableCell>Dispatch Date</TableCell>
                  <TableCell>Dispatch Voucher</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Sales Order</TableCell>
                  <TableCell align="right">Dispatched Quantity</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(!drilldownRow?.dispatches || drilldownRow.dispatches.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 2.5, color: 'text.secondary' }}>
                      No confirmed dispatches recorded for this product in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  drilldownRow.dispatches.map((d, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(d.dispatch_date)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{d.dispatch_no}</TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{d.customer || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.sales_order || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#2563eb', fontSize: 12 }}>
                        {fmtNum(d.quantity, 2)} {drilldownRow.uom}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {d.unit_cost > 0 ? fmtMoney(d.unit_cost, 2) : '—'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label="Dispatched" color="primary" variant="outlined" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Section 2b: Confirmed Customer Returns */}
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Confirmed Customer Returns in Period ({drilldownRow?.returns?.length || 0})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 700 } }}>
                  <TableCell>Return Date</TableCell>
                  <TableCell>Return Voucher</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Dispatch Ref</TableCell>
                  <TableCell>Sales Order</TableCell>
                  <TableCell align="right">Returned Quantity</TableCell>
                  <TableCell align="center">Condition</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(!drilldownRow?.returns || drilldownRow.returns.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', py: 2.5, color: 'text.secondary' }}>
                      No confirmed customer returns recorded for this product in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  drilldownRow.returns.map((ret, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(ret.return_date)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{ret.return_no}</TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{ret.customer || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{ret.dispatch || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{ret.sales_order || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706', fontSize: 12 }}>
                        {fmtNum(ret.return_qty, 2)} {drilldownRow.uom}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={ret.condition || 'Usable'}
                          color={ret.condition === 'Scrap' ? 'error' : 'default'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: 10.5 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label="Confirmed" color="warning" variant="outlined" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Section 3: Current Inventory Breakdown */}
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1, color: '#12262a' }}>
            Current Stock Balance by Stage
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-around' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Finished Goods Warehouse</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#059669' }}>
                  {fmtNum(drilldownRow?.available_stock, 3)} {drilldownRow?.uom}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Stage 3 (CNC)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#b45309' }}>
                  {fmtNum(drilldownRow?.inventory_breakdown?.['Stage 3'] || 0, 2)} {drilldownRow?.uom}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Stage 2 (PU & Casting)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#6d28d9' }}>
                  {fmtNum(drilldownRow?.inventory_breakdown?.['Stage 2'] || 0, 2)} {drilldownRow?.uom}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Stage 1 (Insert Making)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#4338ca' }}>
                  {fmtNum(drilldownRow?.inventory_breakdown?.['Stage 1'] || 0, 2)} {drilldownRow?.uom}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
