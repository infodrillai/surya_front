import ReportChart, { groupChartRows } from '../../../components/ReportChart';
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/SearchRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../../api/client';
import { fmtNum } from '../../../lib/format';

function StatCard({ label, value, subtitle, icon: Icon, color }) {
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
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}>
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
          bgcolor: `${color}15`,
          color: color,
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

export default function CncProductionReportPage() {
  const [tab, setTab] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [machine, setMachine] = useState('All');
  const [shift, setShift] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setMachine('All');
    setShift('All');
    setSearchQuery('');
    setPage(0);
  };

  // 1. Fetch CNC report
  const cncQuery = useQuery({
    queryKey: ['cncProductionReport', fromDate, toDate, machine, shift],
    queryFn: async () => {
      return (
        (await call('clssurya.api.get_cnc_production_report', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          machine: machine !== 'All' ? machine : undefined,
          shift: shift !== 'All' ? shift : undefined,
        })) || { rows: [], summary: {}, machine_summary: [], shift_summary: [], rejection_summary: [] }
      );
    },
    staleTime: 15000,
  });

  // 2. Fetch External Grinding report
  const grindingQuery = useQuery({
    queryKey: ['externalGrindingReport', fromDate, toDate],
    queryFn: async () => {
      return (
        (await call('clssurya.api.get_external_grinding_report', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        })) || { rows: [], summary: {}, vendor_summary: [] }
      );
    },
    staleTime: 15000,
  });

  // 3. Fetch Bonding & Coating report
  const bondingQuery = useQuery({
    queryKey: ['bondingCoatingReport', fromDate, toDate, shift],
    queryFn: async () => {
      return (
        (await call('clssurya.api.get_bonding_coating_report', {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          shift: shift !== 'All' ? shift : undefined,
        })) || { bonding: { rows: [] }, coating: { rows: [] } }
      );
    },
    staleTime: 15000,
  });

  const cncData = cncQuery.data || { rows: [], summary: {} };
  const grindData = grindingQuery.data || { rows: [], summary: {} };
  const bondData = bondingQuery.data || { bonding: { rows: [] }, coating: { rows: [] } };

  const summary = cncData.summary || {};
  const grindSummary = grindData.summary || {};
  const coatingSummary = bondData.coating || {};

  const filteredCncRows = useMemo(() => {
    const list = cncData.rows || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.product || '').toLowerCase().includes(q) ||
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.operator || '').toLowerCase().includes(q) ||
      (r.machine || '').toLowerCase().includes(q) ||
      (r.rejection_reason || '').toLowerCase().includes(q)
    );
  }, [cncData.rows, searchQuery]);

  // Export to CSV
  const exportCsv = (filename, headers, rows) => {
    if (!rows.length) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = () => {
    if (tab === 0) {
      const headers = ['Date', 'Machine', 'Sequence', 'Product', 'Shift', 'Operator', 'Input Qty', 'Accepted Qty', 'Rejected Qty', 'Pending Qty', 'Rejection Reason'];
      const rows = (cncData.rows || []).map((r) => [
        r.production_date || '',
        `"${r.machine || ''}"`,
        `"${r.operation_sequence || ''}"`,
        `"${r.product || ''}"`,
        r.shift || '',
        `"${r.operator || ''}"`,
        r.input_qty || 0,
        r.accepted_qty || 0,
        r.rejected_qty || 0,
        r.pending_qty || 0,
        `"${r.rejection_reason || ''}"`,
      ]);
      exportCsv('CNC_Production_Report', headers, rows);
    } else if (tab === 1) {
      const headers = ['Sent Date', 'Job Ref', 'Product', 'Vendor', 'Sent Qty', 'Received Date', 'Accepted Qty', 'Rejected Qty', 'Pending at Vendor', 'Status'];
      const rows = (grindData.rows || []).map((r) => [
        r.outward_date || '',
        `"${r.job_reference || ''}"`,
        `"${r.product || ''}"`,
        `"${r.vendor || ''}"`,
        r.sent_qty || 0,
        r.inward_date || '',
        r.accepted_qty || 0,
        r.rejected_qty || 0,
        r.pending_qty || 0,
        r.grinding_status || '',
      ]);
      exportCsv('External_Grinding_Report', headers, rows);
    } else if (tab === 3) {
      const headers = ['Type', 'Date', 'Reference / Roll ID', 'Shift', 'Operator', 'Output Quantity', 'Chemicals / Notes'];
      const bRows = (bondData.bonding?.rows || []).map((r) => [
        'Bonding',
        r.production_date || '',
        `"${r.batch_reference || r.name}"`,
        r.shift || '',
        `"${r.operator || ''}"`,
        `${r.bonding_output_kg || 0} KG`,
        `"IPA: ${r.ipa_qty || 0}, Resorcinol: ${r.resorcinol_qty || 0}"`,
      ]);
      const cRows = (bondData.coating?.rows || []).map((r) => [
        'Coating',
        r.coating_date || '',
        `"${r.roll_id || r.name}"`,
        r.shift || '',
        `"${r.operator || ''}"`,
        `${r.roll_meters_coated || 0} Meters`,
        `"Chemicals: ${r.coating_total_kg || 0} KG"`,
      ]);
      exportCsv('Bonding_Coating_Report', headers, [...bRows, ...cRows]);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
            CNC & Production Department Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            CNC operation logs, rejections, machine-wise outputs, external grinding, bonding & roll-wise coating.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              cncQuery.refetch();
              grindingQuery.refetch();
              bondingQuery.refetch();
            }}
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
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{  bgcolor: '#16a34a',
              color: '#ffffff',
              '&:hover': { bgcolor: '#15803d' },
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: 'none',
              fontWeight: 600,}} >
            Export CSV
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ mb: 2.5 }}>
        <ReportChart title="CNC records by machine" points={groupChartRows(filteredCncRows, (row) => row.machine)} />
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="CNC Input Qty" value={fmtNum(summary.total_input || 0)} subtitle={`${summary.total_logs || 0} Operations`} icon={PrecisionManufacturingIcon} color="#2563eb" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="Accepted Output" value={fmtNum(summary.total_accepted || 0)} subtitle="Finished Good Qty" icon={CheckCircleOutlineIcon} color="#059669" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="Rejection Qty" value={fmtNum(summary.total_rejected || 0)} subtitle={`Rate: ${fmtNum(summary.rejection_rate || 0, 1)}%`} icon={CancelOutlinedIcon} color="#dc2626" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="Pending Process" value={fmtNum(summary.total_pending || 0)} subtitle="Waiting Next Stage" icon={HourglassEmptyIcon} color="#d97706" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="Pending Vendor" value={fmtNum(grindSummary.total_pending || 0)} subtitle="External Grinding" icon={LocalShippingOutlinedIcon} color="#7c3aed" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <StatCard label="Rolls Coated" value={`${fmtNum(coatingSummary.total_meters || 0)} M`} subtitle={`${coatingSummary.rows?.length || 0} Rolls Coated`} icon={LayersOutlinedIcon} color="#0891b2" />
        </Grid>
      </Grid>

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
            placeholder="Quick search logs, machine, product..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            InputProps={{
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
            }}
            sx={{ flex: '1.4 1 180px', minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* From Date */}
          <TextField
            size="small"
            type="date"
            label="From Date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: '0 0 auto', width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* To Date */}
          <TextField
            size="small"
            type="date"
            label="To Date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: '0 0 auto', width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}
          />

          {/* Machine */}
          <FormControl size="small" sx={{ flex: '1.2 1 150px', minWidth: 120, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}>
            <InputLabel>Machine</InputLabel>
            <Select value={machine} label="Machine" onChange={(e) => setMachine(e.target.value)}>
              <MenuItem value="All">All Machines</MenuItem>
              <MenuItem value="CNC-01">CNC-01 (Parting Machine)</MenuItem>
              <MenuItem value="CNC-02">CNC-02 (CNC Machine 1)</MenuItem>
              <MenuItem value="CNC-03">CNC-03 (CNC Machine 2)</MenuItem>
              <MenuItem value="CNC-04">CNC-04 (CNC Machine 3)</MenuItem>
            </Select>
          </FormControl>

          {/* Shift */}
          <FormControl size="small" sx={{ flex: '1 1 130px', minWidth: 110, '& .MuiOutlinedInput-root': { borderRadius: '8px', height: 38 } }}>
            <InputLabel>Shift</InputLabel>
            <Select value={shift} label="Shift" onChange={(e) => setShift(e.target.value)}>
              <MenuItem value="All">All Shifts</MenuItem>
              <MenuItem value="Morning">Morning</MenuItem>
              <MenuItem value="Evening">Evening</MenuItem>
              <MenuItem value="Night">Night</MenuItem>
            </Select>
          </FormControl>

          {/* Clear Filters */}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<RestartAltRounded fontSize="small" />}
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
        </Stack>
      </Paper>

      {/* Tabs */}
      <Tabs variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="CNC Operations & Rejections" />
        <Tab label="External Grinding Tracking" />
        <Tab label="Machine & Shift Breakdown" />
        <Tab label="Bonding & Roll Coating" />
      </Tabs>

      {/* Tab 0: CNC Operations & Rejections */}
      {tab === 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Log ID</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Machine</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Sequence / Operation</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Shift</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Operator</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Input Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>Accepted</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>Rejected</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706' }}>Pending</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rejection Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCncRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((r) => (
                <TableRow key={r.name} hover>
                  <TableCell>{r.production_date || '—'}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={r.machine || '—'} variant="outlined" />
                  </TableCell>
                  <TableCell>{r.operation_sequence || r.operation || '—'}</TableCell>
                  <TableCell>{r.product_name || r.product}</TableCell>
                  <TableCell>{r.shift || 'Morning'}</TableCell>
                  <TableCell>{r.operator || '—'}</TableCell>
                  <TableCell align="right">{fmtNum(r.input_qty || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#059669' }}>{fmtNum(r.accepted_qty || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#dc2626' }}>{fmtNum(r.rejected_qty || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#d97706' }}>{fmtNum(r.pending_qty || 0)}</TableCell>
                  <TableCell>
                    {r.rejected_qty > 0 ? (
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={`${r.rejection_reason || 'Rejection'} (${r.rejection_status || 'Scrap'})`}
                      />
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredCncRows || filteredCncRows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No CNC operation logs recorded for the selected criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell colSpan={7} sx={{ fontWeight: 700 }}>Totals</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(summary.total_input || 0)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>{fmtNum(summary.total_accepted || 0)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>{fmtNum(summary.total_rejected || 0)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706' }}>{fmtNum(summary.total_pending || 0)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          <TablePagination
            component="div"
            count={filteredCncRows?.length || 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          />
        </TableContainer>
      )}

      {/* Tab 1: External Grinding Tracking */}
      {tab === 1 && (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Sent Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Job / Batch Ref</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Grinding Vendor</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Sent Qty</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Receipt Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>Accepted Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>Rejected Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#7c3aed' }}>Pending with Vendor</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(grindData.rows || []).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((r) => (
                <TableRow key={r.name} hover>
                  <TableCell>{r.outward_date || '—'}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{r.job_reference || r.name}</TableCell>
                  <TableCell>{r.product}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell align="right">{fmtNum(r.sent_qty || 0)}</TableCell>
                  <TableCell>{r.inward_date || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#059669' }}>{fmtNum(r.accepted_qty || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#dc2626' }}>{fmtNum(r.rejected_qty || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#7c3aed' }}>{fmtNum(r.pending_qty || 0)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.grinding_status || 'Dispatched'}
                      color={r.grinding_status === 'Completed' ? 'success' : r.grinding_status === 'Partially Received' ? 'warning' : 'info'}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(!grindData.rows || grindData.rows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No external grinding records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell colSpan={4} sx={{ fontWeight: 700 }}>Totals</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(grindSummary.total_sent || 0)}</TableCell>
                <TableCell />
                <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>{fmtNum(grindSummary.total_accepted || 0)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>{fmtNum(grindSummary.total_rejected || 0)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#7c3aed' }}>{fmtNum(grindSummary.total_pending || 0)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          <TablePagination
            component="div"
            count={grindData.rows?.length || 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          />
        </TableContainer>
      )}

      {/* Tab 2: Machine & Shift Breakdown */}
      {tab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Machine-wise Production Breakdown
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Machine</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Input Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>Accepted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>Rejected</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Operations</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(cncData.machine_summary || []).map((m) => (
                    <TableRow key={m.machine}>
                      <TableCell sx={{ fontWeight: 600 }}>{m.machine}</TableCell>
                      <TableCell align="right">{fmtNum(m.input_qty)}</TableCell>
                      <TableCell align="right" sx={{ color: '#059669', fontWeight: 600 }}>{fmtNum(m.accepted_qty)}</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 600 }}>{fmtNum(m.rejected_qty)}</TableCell>
                      <TableCell align="right">{m.count}</TableCell>
                    </TableRow>
                  ))}
                  {(!cncData.machine_summary || cncData.machine_summary.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 2, color: 'text.secondary' }}>No machine data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Shift-wise Production Breakdown
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Shift</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>Accepted Output</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>Rejected Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Entries</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(cncData.shift_summary || []).map((s) => (
                    <TableRow key={s.shift}>
                      <TableCell sx={{ fontWeight: 600 }}>{s.shift}</TableCell>
                      <TableCell align="right" sx={{ color: '#059669', fontWeight: 600 }}>{fmtNum(s.accepted_qty)}</TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 600 }}>{fmtNum(s.rejected_qty)}</TableCell>
                      <TableCell align="right">{s.count}</TableCell>
                    </TableRow>
                  ))}
                  {(!cncData.shift_summary || cncData.shift_summary.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>No shift data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}

      {/* Tab 3: Bonding & Roll Coating */}
      {tab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Daily Bonding Production Logs
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#0f766e' }}>Output (KG)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Shift</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Operator</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Target Roll</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(bondData.bonding?.rows || []).map((r) => (
                    <TableRow key={r.name}>
                      <TableCell>{r.production_date}</TableCell>
                      <TableCell>{r.sheet_material}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#0f766e' }}>{fmtNum(r.bonding_output_kg, 2)}</TableCell>
                      <TableCell>{r.shift || 'Morning'}</TableCell>
                      <TableCell>{r.operator || '—'}</TableCell>
                      <TableCell>{r.target_roll_id || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!bondData.bonding?.rows || bondData.bonding.rows.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 2, color: 'text.secondary' }}>No bonding logs found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Roll-wise Coating Activity
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Roll ID</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#0891b2' }}>Coated Meters</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Chemicals (KG)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Shift</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Operator</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(bondData.coating?.rows || []).map((r) => (
                    <TableRow key={r.name}>
                      <TableCell>{r.coating_date}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{r.roll_id}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#0891b2' }}>{fmtNum(r.roll_meters_coated, 1)}</TableCell>
                      <TableCell align="right">{fmtNum(r.coating_total_kg, 2)}</TableCell>
                      <TableCell>{r.shift || 'Morning'}</TableCell>
                      <TableCell>{r.operator || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!bondData.coating?.rows || bondData.coating.rows.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 2, color: 'text.secondary' }}>No coating logs found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
