import ReportChart, { groupChartRows } from '../../../components/ReportChart';
import React, { useMemo, useState } from 'react';
import {
  Box, Button, Chip, FormControl, Grid, InputLabel, Paper,
  MenuItem, Select, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../../api/client';
import { useMasters } from '../../../hooks/useMasters';
import { fmtDate, fmtNum } from '../../../lib/format';

import {
  ProductionReportHeader, ProductionReportMetric, ProductionReportMetrics,
  reportExportSx, reportFiltersSx, reportHeadingRowSx, reportPageSx, reportTableHeight, reportTableSx,
} from './ProductionReportLayout';

const STAGES = [
  { value: '1', label: 'Stage 1 · Insert Making', color: '#2563eb' },
  { value: '2', label: 'Stage 2 · PU Casting', color: '#7c3aed' },
  { value: '3', label: 'Stage 3 · CNC', color: '#0891b2' },
];

export default function PUProductionReportPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stage, setStage] = useState('All');
  const [status, setStatus] = useState('All');
  const [product, setProduct] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const report = useQuery({
    queryKey: ['pu-production-report', fromDate, toDate],
    queryFn: () => call('clssurya.api.get_pu_production_report', {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }),
    staleTime: 30000,
  });
  const productMaster = useMasters('Product');
  const productNames = useMemo(
    () => new Map(productMaster.map(({ name, product_name }) => [name, product_name])),
    [productMaster],
  );
  const rows = report.data?.rows || [];
  const products = useMemo(() => [...new Set(rows.map((row) => row.product).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (stage !== 'All' && String(row.stage_no) !== stage) return false;
    if (status !== 'All' && String(row.status || '') !== status) return false;
    if (product !== 'All' && row.product !== product) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (![row.name, row.product, productNames.get(row.product), row.production_code, row.operator, row.machine, row.stage_label]
        .some((value) => String(value || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, stage, status, product, search, productNames]);
  const totals = useMemo(() => filtered.reduce((acc, row) => {
    acc.batches += 1;
    acc.produced += Number(row.produced_qty) || 0;
    acc.accepted += Number(row.accepted_qty) || 0;
    acc.rejected += Number(row.rejected_qty) || 0;
    return acc;
  }, { batches: 0, produced: 0, accepted: 0, rejected: 0 }), [filtered]);
  const stageTotals = useMemo(() => STAGES.map((item) => {
    const stageRows = filtered.filter((row) => String(row.stage_no) === item.value);
    return { ...item, batches: stageRows.length, quantity: stageRows.reduce((sum, row) => sum + (Number(row.produced_qty) || 0), 0) };
  }), [filtered]);

  const exportCsv = () => {
    const columns = ['Batch', 'Date', 'Product', 'Production Code', 'Stage', 'Produced Qty', 'Accepted Qty', 'Rejected Qty', 'Status', 'Operator', 'Machine', 'Shift'];
    const values = filtered.map((row) => [row.name, row.posting_date, row.product, row.production_code, row.stage_label, row.produced_qty, row.accepted_qty, row.rejected_qty, row.status, row.operator, row.machine, row.shift]);
    const csv = [columns, ...values].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `PU_Production_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <Box sx={reportPageSx}>
    <ProductionReportHeader
      title="PU Production Report"
      description="Track batch quantities and progress across all three PU production stages."
    >
      <Button variant="contained" size="small" startIcon={<RefreshRoundedIcon />} onClick={() => report.refetch()} disabled={report.isFetching}>
        Refresh
      </Button>
      <Button variant="contained" size="small" startIcon={<DownloadRoundedIcon />} onClick={exportCsv} disabled={!filtered.length} sx={reportExportSx}>
        Export CSV
      </Button>
    </ProductionReportHeader>

    <Box sx={{ mb: 2.5 }}>
      <ReportChart title="PU batches by stage" points={groupChartRows(filtered, (row) => row.stage_label)} />
    </Box>

    <ProductionReportMetrics>
      <ProductionReportMetric title="Produced Quantity" value={fmtNum(totals.produced, 3)} caption="Across selected stages" color="info.main" />
      <ProductionReportMetric title="Accepted Quantity" value={fmtNum(totals.accepted, 3)} caption="Accepted output" color="success.main" />
      <ProductionReportMetric title="Rejected Quantity" value={fmtNum(totals.rejected, 3)} caption="Rejected or scrap output" color="error.main" />
      {stageTotals.map((item) => (
        <ProductionReportMetric key={item.value} title={item.label} value={fmtNum(item.quantity, 3)} caption={`${item.batches} batches`} color={item.color} />
      ))}
    </ProductionReportMetrics>

    <Paper variant="outlined" sx={reportFiltersSx}>
      <Grid container spacing={1.5} alignItems="center">
        <Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="From date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} InputLabelProps={{ shrink: true }} /></Grid>
        <Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="To date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} InputLabelProps={{ shrink: true }} /></Grid>
        <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Stage</InputLabel><Select label="Stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(0); }}><MenuItem value="All">All stages</MenuItem>{STAGES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl></Grid>
        <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Product</InputLabel><Select label="Product" value={product} onChange={(e) => { setProduct(e.target.value); setPage(0); }}><MenuItem value="All">All products</MenuItem>{products.map((item) => <MenuItem key={item} value={item}>{productNames.get(item) || item}</MenuItem>)}</Select></FormControl></Grid>
        <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><MenuItem value="All">All statuses</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="In Progress">In Progress</MenuItem><MenuItem value="Draft">Draft</MenuItem></Select></FormControl></Grid>
        <Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" label="Search batches" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></Grid>
      </Grid>
    </Paper>

    {report.isError && <Typography color="error" sx={{ mb: 2 }}>{report.error?.message || 'Could not load the PU production report.'}</Typography>}
    <Paper variant="outlined" sx={reportTableSx}>
      <TableContainer sx={{ maxHeight: reportTableHeight }}><Table stickyHeader size="small">
        <TableHead><TableRow sx={reportHeadingRowSx}>{['#', 'Batch No.', 'Date', 'Product', 'Production Code', 'Stage', 'Produced', 'Accepted', 'Rejected', 'Status', 'Operator', 'Machine'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{report.isLoading ? <TableRow><TableCell colSpan={12} align="center" sx={{ py: 5 }}>Loading production records…</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={12} align="center" sx={{ py: 5, color: 'text.secondary' }}>No PU production batches match these filters.</TableCell></TableRow> : filtered.slice(page * pageSize, page * pageSize + pageSize).map((row, index) => <TableRow hover key={`${row.stage_no}-${row.name}`}>
          <TableCell>{page * pageSize + index + 1}</TableCell><TableCell sx={{ fontWeight: 700 }}>{row.name}</TableCell><TableCell>{fmtDate(row.posting_date)}</TableCell><TableCell>{productNames.get(row.product) || row.product || '—'}</TableCell><TableCell>{row.production_code || '—'}</TableCell><TableCell><Chip size="small" label={row.stage_label} sx={{ fontWeight: 650 }} /></TableCell><TableCell align="right">{fmtNum(row.produced_qty, 3)}</TableCell><TableCell align="right" sx={{ color: 'success.main' }}>{fmtNum(row.accepted_qty, 3)}</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>{fmtNum(row.rejected_qty, 3)}</TableCell><TableCell><Chip size="small" label={row.status || 'Draft'} color={row.status === 'Completed' ? 'success' : row.status === 'In Progress' ? 'warning' : 'default'} variant="outlined" /></TableCell><TableCell>{row.operator || '—'}</TableCell><TableCell>{row.machine || '—'}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      <TablePagination component="div" count={filtered.length} page={page} onPageChange={(_, value) => setPage(value)} rowsPerPage={pageSize} onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50, 100]} />
    </Paper>
  </Box>;
}