import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
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
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccessTimeOutlined,
  CheckCircleOutlineRounded,
  CloseRounded,
  DownloadRounded,
  FilterListRounded,
  PrecisionManufacturingOutlined,
  RefreshRounded,
  SearchRounded,
  SpeedOutlined,
  WarningAmberRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { call } from '../api/client';
import { fmtDate, fmtNum } from '../lib/format';
import { palette } from '../theme';

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
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ mt: 0.5, mb: 0.25, fontWeight: 750, color: '#12262a' }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subtitle}
        </Typography>
      </Box>
      <Box
        sx={{
          width: 40,
          height: 40,
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

export default function CncMachineReportPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [machineFilter, setMachineFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');

  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'logs'
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const query = useQuery({
    queryKey: ['cnc_machine_report', fromDate, toDate, machineFilter, productSearch, operatorFilter],
    queryFn: async () => {
      const res = await call('clssurya.api.get_cnc_machine_report', {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        machine: machineFilter || undefined,
        product: productSearch || undefined,
        operator: operatorFilter || undefined,
      });
      return res || { summary: [], logs: [] };
    },
    staleTime: 10_000,
  });

  const summary = query.data?.summary || [];
  const logs = query.data?.logs || [];

  // Totals across machines
  const totalStats = useMemo(() => {
    let hours = 0, processed = 0, accepted = 0, rejected = 0;
    summary.forEach((m) => {
      hours += Number(m.total_duration_hours) || 0;
      processed += Number(m.qty_processed) || 0;
      accepted += Number(m.accepted_qty) || 0;
      rejected += Number(m.rejected_qty) || 0;
    });
    const avgTimePerUnit = accepted > 0 ? ((hours * 60) / accepted).toFixed(1) : 0;
    return { hours: hours.toFixed(1), processed, accepted, rejected, avgTimePerUnit };
  }, [summary]);

  const handleExportCSV = () => {
    if (activeTab === 'summary') {
      if (!summary.length) return;
      const headers = ['Machine Code', 'Machine Name', 'Type', 'Status', 'Total Hours', 'Running Mins', 'Downtime Mins', 'Processed Qty', 'Accepted Qty', 'Rejected Qty', 'Avg Mins/Unit', 'Sessions'];
      const rows = summary.map((s) => [
        `"${s.machine}"`,
        `"${s.machine_name}"`,
        `"${s.machine_type || ''}"`,
        `"${s.status || ''}"`,
        s.total_duration_hours,
        s.running_time_mins,
        s.downtime_mins,
        s.qty_processed,
        s.accepted_qty,
        s.rejected_qty,
        s.avg_time_per_unit_mins,
        s.session_count,
      ]);
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encoded = encodeURI(csv);
      const link = document.createElement('a');
      link.href = encoded;
      link.download = `CNC_Machine_Summary_${fromDate}_to_${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!logs.length) return;
      const headers = ['Date', 'Machine', 'Batch No', 'Product Code', 'Product Name', 'Process', 'Operator', 'Start Time', 'End Time', 'Duration (Mins)', 'Processed Qty', 'Accepted Qty', 'Rejected Qty'];
      const rows = logs.map((l) => [
        l.posting_date,
        `"${l.machine}"`,
        `"${l.production_batch || ''}"`,
        `"${l.product_code || ''}"`,
        `"${(l.product_name || '').replace(/"/g, '""')}"`,
        `"${l.process || ''}"`,
        `"${l.operator || ''}"`,
        `"${l.start_time || ''}"`,
        `"${l.end_time || ''}"`,
        l.total_duration,
        l.qty_processed,
        l.accepted_qty,
        l.rejected_qty,
      ]);
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encoded = encodeURI(csv);
      const link = document.createElement('a');
      link.href = encoded;
      link.download = `CNC_Machine_Logs_${fromDate}_to_${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const paginatedLogs = useMemo(() => {
    return logs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [logs, page, rowsPerPage]);

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
              CNC Machine-wise Production & Time Tracking
            </Typography>
            <Chip
              size="small"
              label={`${summary.length} Machines Active`}
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
            Operating hours, downtime, average processing time per accepted unit, and machine utilization.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Paper variant="outlined" sx={{ display: 'flex', p: 0.5, borderRadius: '10px' }}>
            <Button
              size="small"
              onClick={() => setActiveTab('summary')}
              sx={{
                borderRadius: '8px',
                px: 1.5,
                fontWeight: 700,
                fontSize: 12.5,
                bgcolor: activeTab === 'summary' ? palette.teal : 'transparent',
                color: activeTab === 'summary' ? '#ffffff' : 'text.secondary',
              }}
            >
              Machine Summary
            </Button>
            <Button
              size="small"
              onClick={() => setActiveTab('logs')}
              sx={{
                borderRadius: '8px',
                px: 1.5,
                fontWeight: 700,
                fontSize: 12.5,
                bgcolor: activeTab === 'logs' ? palette.teal : 'transparent',
                color: activeTab === 'logs' ? '#ffffff' : 'text.secondary',
              }}
            >
              Operation Logs ({logs.length})
            </Button>
          </Paper>

          <Tooltip title="Export to CSV">
            <span>
              <IconButton onClick={handleExportCSV} sx={{ bgcolor: '#ffffff', border: '1px solid #dde5e3' }}>
                <DownloadRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={() => query.refetch()} disabled={query.isFetching} sx={{ bgcolor: '#ffffff', border: '1px solid #dde5e3' }}>
                <RefreshRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Total Operating Hours"
          value={`${totalStats.hours} hrs`}
          subtitle="Sum of active machining sessions"
          icon={AccessTimeOutlined}
          iconBg="#e0f2fe"
          iconColor="#0284c7"
        />
        <StatCard
          label="Total Quantity Processed"
          value={fmtNum(totalStats.processed, 2)}
          subtitle="Total parts through CNC"
          icon={PrecisionManufacturingOutlined}
          iconBg="#eef2ff"
          iconColor="#4338ca"
        />
        <StatCard
          label="Accepted Output"
          value={fmtNum(totalStats.accepted, 2)}
          subtitle="Quality-approved parts"
          icon={CheckCircleOutlineRounded}
          iconBg="#ecfdf5"
          iconColor="#059669"
        />
        <StatCard
          label="Total Rejections"
          value={fmtNum(totalStats.rejected, 2)}
          subtitle="CNC scrap & tooling reject"
          icon={WarningAmberRounded}
          iconBg="#fef2f2"
          iconColor="#dc2626"
        />
        <StatCard
          label="Avg Time Per Unit"
          value={`${totalStats.avgTimePerUnit} mins`}
          subtitle="Across accepted units"
          icon={SpeedOutlined}
          iconBg="#fffbeb"
          iconColor="#b45309"
        />
      </Box>

      {/* Filter Area */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: '14px', bgcolor: '#ffffff', borderColor: '#dde5e3' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
          <TextField
            type="date"
            label="From Date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: '100%', md: 170 } }}
          />
          <TextField
            type="date"
            label="To Date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: '100%', md: 170 } }}
          />

          <TextField
            placeholder="Filter machine code/name…"
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            size="small"
            sx={{ width: { xs: '100%', md: 200 } }}
          />

          <TextField
            placeholder="Filter operator…"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            size="small"
            sx={{ width: { xs: '100%', md: 180 } }}
          />

          <TextField
            placeholder="Search product…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 180 }}
          />

          {(machineFilter || operatorFilter || productSearch) && (
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setMachineFilter('');
                setOperatorFilter('');
                setProductSearch('');
              }}
              sx={{ color: 'text.secondary', fontSize: 12 }}
            >
              Reset
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Table Section */}
      {activeTab === 'summary' ? (
        <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 750, color: '#1e293b' } }}>
                  <TableCell>Machine Code</TableCell>
                  <TableCell>Machine Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Working Hours</TableCell>
                  <TableCell align="right">Running Time (Mins)</TableCell>
                  <TableCell align="right">Downtime (Mins)</TableCell>
                  <TableCell align="right">Processed Qty</TableCell>
                  <TableCell align="right" sx={{ color: '#059669' }}>Accepted Qty</TableCell>
                  <TableCell align="right" sx={{ color: '#dc2626' }}>Rejection Qty</TableCell>
                  <TableCell align="right">Avg Time / Unit</TableCell>
                  <TableCell align="center">Sessions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={24} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : summary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} sx={{ py: 6, textAlign: 'center' }}>
                      <SpeedOutlined sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>No CNC machine data recorded</Typography>
                      <Typography variant="caption" color="text.secondary">Create machines in CNC Machine Master or record operations in Stage 3.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.map((s) => (
                    <TableRow key={s.machine} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: palette.teal }}>{s.machine}</TableCell>
                      <TableCell sx={{ fontWeight: 650 }}>{s.machine_name}</TableCell>
                      <TableCell>{s.machine_type || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={s.status || 'Active'}
                          color={s.status === 'Active' ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ height: 22, fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 750 }}>{s.total_duration_hours} hrs</TableCell>
                      <TableCell align="right">{s.running_time_mins} m</TableCell>
                      <TableCell align="right">{s.downtime_mins} m</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(s.qty_processed, 2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 750, color: '#059669' }}>{fmtNum(s.accepted_qty, 2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 750, color: Number(s.rejected_qty) > 0 ? '#dc2626' : 'text.secondary' }}>
                        {fmtNum(s.rejected_qty, 2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#b45309' }}>
                        {s.avg_time_per_unit_mins > 0 ? `${s.avg_time_per_unit_mins} min/pc` : '—'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={s.session_count} sx={{ height: 20, fontSize: 11 }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8faf9', fontWeight: 750, color: '#1e293b' } }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Machine</TableCell>
                  <TableCell>Batch No</TableCell>
                  <TableCell>Product Code</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Process</TableCell>
                  <TableCell>Operator</TableCell>
                  <TableCell>Start Time</TableCell>
                  <TableCell>End Time</TableCell>
                  <TableCell align="right">Duration (Mins)</TableCell>
                  <TableCell align="right">Processed</TableCell>
                  <TableCell align="right" sx={{ color: '#059669' }}>Accepted</TableCell>
                  <TableCell align="right" sx={{ color: '#dc2626' }}>Rejected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} sx={{ py: 6, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">No individual logs match the selected filters.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLogs.map((l, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontSize: 12.5 }}>{fmtDate(l.posting_date)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650 }}>{l.machine}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: palette.teal }}>{l.production_batch || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{l.product_code || '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{l.product_name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{l.process || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{l.operator || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{l.start_time || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{l.end_time || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{l.total_duration ? `${l.total_duration} m` : '—'}</TableCell>
                      <TableCell align="right">{fmtNum(l.qty_processed, 2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669' }}>{fmtNum(l.accepted_qty, 2)}</TableCell>
                      <TableCell align="right" sx={{ color: Number(l.rejected_qty) > 0 ? '#dc2626' : 'text.secondary' }}>{fmtNum(l.rejected_qty, 2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={logs.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Paper>
      )}
    </Box>
  );
}
