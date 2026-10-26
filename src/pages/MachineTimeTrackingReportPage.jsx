import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DownloadRounded, RefreshRounded, SearchRounded } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { call } from "../api/client";
import { fmtDate, fmtNum } from "../lib/format";
import { palette } from "../theme";

function fmtDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const s = Math.abs(Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const STAGE_OPTIONS = ["", "Stage 1", "Stage 2", "Stage 3"];
const STAGE_LABELS = {
  "": "All Stages",
  "Stage 1": "Stage 1 (Insert Making)",
  "Stage 2": "Stage 2 (PU & Casting)",
  "Stage 3": "Stage 3 (CNC)",
};

export default function MachineTimeTrackingReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState(sixMonthsAgo);
  const [toDate, setToDate] = useState(today);
  const [machine, setMachine] = useState("");
  const [product, setProduct] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [stage, setStage] = useState("");
  const [operator, setOperator] = useState("");

  const query = useQuery({
    queryKey: ["machine_time_report", fromDate, toDate, machine, product, batchNo, stage, operator],
    queryFn: async () => {
      const res = await call("clssurya.api.get_machine_time_report", {
        from_date: fromDate,
        to_date: toDate,
        machine: machine || undefined,
        product: product || undefined,
        batch_no: batchNo || undefined,
        stage: stage || undefined,
        operator: operator || undefined,
      });
      return res || [];
    },
    staleTime: 10_000,
  });

  const rows = query.data || [];

  const totals = useMemo(() => {
    const sum = (f) => rows.reduce((a, r) => a + Number(r[f] || 0), 0);
    const totalSeconds = rows.reduce((a, r) => a + Number(r.elapsed_seconds || 0), 0);
    return {
      inputQty: sum("input_qty"),
      producedQty: sum("produced_qty"),
      rejectedQty: sum("rejected_qty"),
      goodOutput: sum("good_output"),
      hours: fmtDuration(totalSeconds),
    };
  }, [rows]);

  const handleExportCSV = () => {
    const headers = [
      "Production Date","Machine","Machine Type","Batch No.",
      "Product Code","Product Name","Production Code","Stage","Operator",
      "Start Time","End Time","Running Hours",
      "Input Qty","Produced Qty","Rejected Qty","Good Output","Remarks",
    ];
    const csvRows = rows.map((r) => [
      `"${fmtDate(r.production_date)}"`,
      `"${r.machine || ""}"`,
      `"${r.machine_type || ""}"`,
      `"${r.batch_no || ""}"`,
      `"${r.product_code || ""}"`,
      `"${r.product_name || ""}"`,
      `"${r.production_code || ""}"`,
      `"${r.stage || ""}"`,
      `"${r.operator || ""}"`,
      `"${r.start_time || ""}"`,
      `"${r.end_time || ""}"`,
      `"${fmtDuration(r.elapsed_seconds)}"`,
      r.input_qty ?? "",
      r.produced_qty ?? "",
      r.rejected_qty ?? "",
      r.good_output ?? "",
      `"${(r.remarks || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Machine_Time_Report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}
        sx={{ mb: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 750, color: "#12262a" }}>
            Machine-wise Production &amp; Time-Tracking Report
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Track machine usage, running hours, and batch-wise production quantities.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip label={`${rows.length} Records`} size="small"
            sx={{ bgcolor: "#e6f0ee", color: palette.teal, fontWeight: 700, fontSize: 12, borderRadius: "8px" }} />
          <Tooltip title="Export CSV">
            <span>
              <IconButton onClick={handleExportCSV} disabled={!rows.length}
                sx={{ bgcolor: "#fff", border: "1px solid #dde5e3", "&:hover": { bgcolor: "#f3f6f5" } }}>
                <DownloadRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton onClick={() => query.refetch()} disabled={query.isFetching}
              sx={{ bgcolor: "#fff", border: "1px solid #dde5e3", "&:hover": { bgcolor: "#f3f6f5" } }}>
              <RefreshRounded fontSize="small"
                sx={{
                  animation: query.isFetching ? "spin 1s linear infinite" : "none",
                  "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
                }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: "14px", bgcolor: "#ffffff", borderColor: "#dde5e3" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} flexWrap="wrap">
          <TextField label="From Date" type="date" size="small" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <TextField label="To Date" type="date" size="small" value={toDate} onChange={(e) => setToDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={stage} onChange={(e) => setStage(e.target.value)} displayEmpty
              sx={{ borderRadius: "10px", bgcolor: "#f8faf9", fontSize: 13.5 }}>
              {STAGE_OPTIONS.map((s) => (<MenuItem key={s} value={s}>{STAGE_LABELS[s]}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField label="Machine" size="small" value={machine} onChange={(e) => setMachine(e.target.value)}
            placeholder="All machines"
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" sx={{ color: "text.secondary" }} /></InputAdornment> } }}
            sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <TextField label="Operator" size="small" value={operator} onChange={(e) => setOperator(e.target.value)}
            placeholder="All operators"
            sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <TextField label="Product" size="small" value={product} onChange={(e) => setProduct(e.target.value)}
            placeholder="All products"
            sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <TextField label="Batch No." size="small" value={batchNo} onChange={(e) => setBatchNo(e.target.value)}
            placeholder="All batches"
            sx={{ minWidth: 140, "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8faf9" } }} />
          <Button variant="outlined" size="small" sx={{ borderRadius: "9px", alignSelf: "center" }}
            onClick={() => { setMachine(""); setProduct(""); setBatchNo(""); setStage(""); setOperator(""); setFromDate(sixMonthsAgo); setToDate(today); }}>
            Reset
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: "14px", overflow: "hidden", bgcolor: "#ffffff" }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: "#f1f5f9" }}>
              <TableRow>
                {["Date","Machine","Type","Batch No.","Prod. Code","Product","Stage","Operator","Start","End","Hours","Input","Produced","Rejected","Good Output","Remarks"].map((col) => (
                  <TableCell key={col} sx={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{col}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.production_date)}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{r.machine || "—"}</TableCell>
                    <TableCell>{r.machine_type || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{r.batch_no || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{r.production_code || "—"}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>{r.product_name}</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>{r.product_code}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={STAGE_LABELS[r.stage] || r.stage}
                        sx={{ fontSize: 11, height: 20, borderRadius: "5px", bgcolor: "#e6f0ee", color: palette.teal, fontWeight: 700 }} />
                    </TableCell>
                    <TableCell>{r.operator || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.start_time || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.end_time || "—"}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: palette.teal, fontFamily: "monospace" }}>{fmtDuration(r.elapsed_seconds)}</TableCell>
                    <TableCell align="right">{fmtNum(r.input_qty, 2)}</TableCell>
                    <TableCell align="right">{fmtNum(r.produced_qty, 2)}</TableCell>
                    <TableCell align="right" sx={{ color: "#ef4444" }}>{fmtNum(r.rejected_qty, 2)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: "#059669" }}>{fmtNum(r.good_output, 2)}</TableCell>
                    <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.remarks || "—"}</TableCell>
                  </TableRow>
                ))
              )}
              {rows.length > 0 && (
                <TableRow sx={{ bgcolor: "#f8faf9", borderTop: "2px solid #e2e8f0" }}>
                  <TableCell colSpan={10} sx={{ fontWeight: 700, color: "#12262a" }}>Totals ({rows.length} rows)</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: palette.teal, fontFamily: "monospace" }}>{totals.hours}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(totals.inputQty, 2)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(totals.producedQty, 2)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "#ef4444" }}>{fmtNum(totals.rejectedQty, 2)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "#059669" }}>{fmtNum(totals.goodOutput, 2)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
