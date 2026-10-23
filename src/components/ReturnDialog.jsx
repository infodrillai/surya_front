import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import { call, insertDoc, runAction } from '../api/client';
import { fmtDate, fmtNum } from '../lib/format';

const CONDITIONS = ['Usable', 'Damaged', 'Requires Inspection'];

const CONDITION_COLORS = {
  Usable: 'success',
  Damaged: 'error',
  'Requires Inspection': 'warning',
};

const RETURN_STATUS_COLORS = {
  Draft: 'default',
  Confirmed: 'success',
  Cancelled: 'error',
};

/** ReturnDialog — opened from a Dispatched dispatch row action. */
export default function ReturnDialog({ open, dispatchName, onClose }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [dispatchData, setDispatchData] = useState(null);   // { items, sales_order, customer }
  const [returnHistory, setReturnHistory] = useState([]);   // past returns for this dispatch
  const [showHistory, setShowHistory] = useState(false);

  // Per-item state: { [dispatch_item]: { qty: '', condition: 'Usable' } }
  const [rows, setRows] = useState({});
  const [errors, setErrors] = useState({});
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  // Load dispatch data when dialog opens
  useEffect(() => {
    if (!open || !dispatchName) return;
    setLoading(true);
    setApiError('');
    setReason('');
    setReasonError('');
    setShowHistory(false);

    Promise.all([
      call('clssurya.api.get_dispatch_return_items', { dispatch_name: dispatchName }, { get: true }),
      call('clssurya.api.get_dispatch_returns', { dispatch_name: dispatchName }, { get: true }),
    ])
      .then(([dispData, hist]) => {
        setDispatchData(dispData);
        setReturnHistory(hist || []);
        // Initialise row state (only returnable items)
        const init = {};
        (dispData?.items || []).forEach((item) => {
          init[item.dispatch_item] = { qty: '', condition: 'Usable' };
        });
        setRows(init);
        setErrors({});
      })
      .catch((e) => setApiError(e?.message || 'Failed to load dispatch data.'))
      .finally(() => setLoading(false));
  }, [open, dispatchName]);

  function validateRow(dispatch_item, qty, returnable_qty) {
    const trimmed = String(qty).trim();
    if (trimmed === '' || trimmed === '0') return null; // optional
    const num = Number(trimmed);
    if (isNaN(num) || num < 0) return 'Enter a valid number ≥ 0';
    if (num <= 0) return null;
    if (num > returnable_qty + 1e-9) return `Max ${fmtNum(returnable_qty, 2)}`;
    return null;
  }

  function handleQtyChange(dispatch_item, value, returnable_qty) {
    setRows((prev) => ({ ...prev, [dispatch_item]: { ...prev[dispatch_item], qty: value } }));
    const err = validateRow(dispatch_item, value, returnable_qty);
    setErrors((prev) => {
      const n = { ...prev };
      if (err) n[dispatch_item] = err;
      else delete n[dispatch_item];
      return n;
    });
  }

  function handleConditionChange(dispatch_item, value) {
    setRows((prev) => ({ ...prev, [dispatch_item]: { ...prev[dispatch_item], condition: value } }));
  }

  async function handleSubmit() {
    // Validate reason
    if (!reason.trim()) {
      setReasonError('Return reason is required.');
      return;
    }
    setReasonError('');

    // Validate all rows
    const newErrors = {};
    let atLeastOne = false;
    for (const item of (dispatchData?.items || [])) {
      const row = rows[item.dispatch_item] || { qty: '', condition: 'Usable' };
      const trimmed = String(row.qty).trim();
      if (trimmed === '' || trimmed === '0') continue;
      const err = validateRow(item.dispatch_item, row.qty, item.returnable_qty);
      if (err) {
        newErrors[item.dispatch_item] = err;
      } else if (Number(trimmed) > 0) {
        atLeastOne = true;
      }
    }
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    if (!atLeastOne) { setApiError('Enter a return quantity > 0 for at least one item.'); return; }

    setSubmitting(true);
    setApiError('');
    try {
      // Build items array (only rows with qty > 0)
      const items = (dispatchData?.items || [])
        .map((item) => {
          const row = rows[item.dispatch_item] || { qty: '0', condition: 'Usable' };
          const qty = Number(String(row.qty).trim()) || 0;
          if (qty <= 0) return null;
          return {
            dispatch_item: item.dispatch_item,
            order_item: item.order_item,
            product: item.product,
            dispatched_qty: item.dispatched_qty,
            already_returned: item.already_returned,
            returnable_qty: item.returnable_qty,
            return_qty: qty,
            condition: row.condition,
            unit_cost: item.unit_cost,
          };
        })
        .filter(Boolean);

      // Create a Draft Customer Return doc
      const doc = await insertDoc('Customer Return', {
        dispatch: dispatchName,
        sales_order: dispatchData.sales_order,
        customer: dispatchData.customer,
        return_date: new Date().toISOString().slice(0, 10),
        return_reason: reason.trim(),
        items,
      });

      onClose(`Return ${doc.name} created (Draft). Confirm it to update stock.`);
    } catch (e) {
      setApiError(e?.message || 'Failed to create return. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const returnableItems = (dispatchData?.items || []).filter((i) => i.returnable_qty > 0);
  const fullyReturnedItems = (dispatchData?.items || []).filter((i) => i.returnable_qty <= 0);

  return (
    <Dialog open={open} onClose={() => !submitting && onClose(null)} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0d6efd 100%)',
          color: '#fff',
          pb: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <AssignmentReturnIcon />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Create Customer Return
            </Typography>
            {dispatchName && (
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                Dispatch: {dispatchName}
                {dispatchData?.customer && ` · Customer: ${dispatchData.customer}`}
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {returnHistory.length > 0 && (
            <Button
              size="small"
              startIcon={<HistoryIcon />}
              onClick={() => setShowHistory((p) => !p)}
              sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', mr: 1 }}
              variant="outlined"
            >
              History ({returnHistory.length})
            </Button>
          )}
          <IconButton onClick={() => !submitting && onClose(null)} size="small" sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            {apiError && (
              <Alert severity="error" sx={{ m: 2 }}>
                {apiError}
              </Alert>
            )}

            {/* ---- Return History Panel ---- */}
            {showHistory && returnHistory.length > 0 && (
              <Paper variant="outlined" sx={{ m: 2, p: 2, bgcolor: '#f8fafc' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <HistoryIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" fontWeight={700}>
                    Return History
                  </Typography>
                </Stack>
                {returnHistory.map((ret) => (
                  <Box
                    key={ret.name}
                    sx={{
                      mb: 1.5,
                      pb: 1.5,
                      borderBottom: '1px solid #e2e8f0',
                      '&:last-child': { mb: 0, pb: 0, borderBottom: 'none' },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {ret.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={ret.return_status}
                        color={RETURN_STATUS_COLORS[ret.return_status] || 'default'}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {fmtDate(ret.return_date)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Reason: {ret.return_reason}
                    </Typography>
                    {ret.items?.map((ri, idx) => (
                      <Typography key={idx} variant="caption" display="block" sx={{ mt: 0.25 }}>
                        • {ri.product_name}: {fmtNum(ri.return_qty, 2)} returned —{' '}
                        <Chip
                          size="small"
                          label={ri.condition}
                          color={CONDITION_COLORS[ri.condition] || 'default'}
                          sx={{ height: 16, fontSize: 10 }}
                        />
                      </Typography>
                    ))}
                  </Box>
                ))}
              </Paper>
            )}

            {/* ---- Return Reason ---- */}
            <Box sx={{ px: 2.5, pt: 2.5 }}>
              <TextField
                label="Return Reason *"
                placeholder="Describe why goods are being returned…"
                value={reason}
                onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(''); }}
                error={!!reasonError}
                helperText={reasonError}
                fullWidth
                multiline
                minRows={2}
                sx={{ mb: 2 }}
              />
            </Box>

            {/* ---- Returnable Items ---- */}
            {returnableItems.length > 0 ? (
              <Box sx={{ px: 2.5 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Enter return quantity and select condition. Leave blank to skip that item.
                </Alert>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc' } }}>
                        <TableCell>Product</TableCell>
                        <TableCell align="right">Dispatched</TableCell>
                        <TableCell align="right">Already Returned</TableCell>
                        <TableCell align="right">Returnable</TableCell>
                        <TableCell align="right" sx={{ minWidth: 150 }}>
                          Return Qty
                        </TableCell>
                        <TableCell sx={{ minWidth: 180 }}>Condition</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {returnableItems.map((item) => {
                        const row = rows[item.dispatch_item] || { qty: '', condition: 'Usable' };
                        const hasValue = Number(String(row.qty).trim()) > 0;
                        return (
                          <TableRow
                            key={item.dispatch_item}
                            hover
                            sx={{
                              bgcolor: hasValue ? 'rgba(59,130,246,0.04)' : undefined,
                            }}
                          >
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>
                                {item.product_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.product}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{fmtNum(item.dispatched_qty, 2)}</TableCell>
                            <TableCell align="right">
                              {item.already_returned > 0 ? (
                                <Typography variant="body2" color="warning.main" fontWeight={600}>
                                  {fmtNum(item.already_returned, 2)}
                                </Typography>
                              ) : (
                                '0'
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" color="success.main" fontWeight={700}>
                                {fmtNum(item.returnable_qty, 2)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                placeholder="0"
                                value={row.qty}
                                onChange={(e) =>
                                  handleQtyChange(item.dispatch_item, e.target.value, item.returnable_qty)
                                }
                                error={!!errors[item.dispatch_item]}
                                helperText={errors[item.dispatch_item]}
                                inputProps={{ min: 0, max: item.returnable_qty, step: 1 }}
                                InputProps={{
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Typography variant="caption" color="text.secondary">
                                        / {fmtNum(item.returnable_qty, 2)}
                                      </Typography>
                                    </InputAdornment>
                                  ),
                                }}
                                sx={{ width: 150 }}
                              />
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select
                                  value={row.condition}
                                  onChange={(e) => handleConditionChange(item.dispatch_item, e.target.value)}
                                >
                                  {CONDITIONS.map((c) => (
                                    <MenuItem key={c} value={c}>
                                      <Chip
                                        size="small"
                                        label={c}
                                        color={CONDITION_COLORS[c] || 'default'}
                                        sx={{ cursor: 'pointer' }}
                                      />
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ) : (
              <Box sx={{ px: 2.5, pb: 2.5 }}>
                <Alert
                  severity="success"
                  icon={<CheckCircleOutlineIcon />}
                  sx={{ borderRadius: 2 }}
                >
                  All dispatched items have already been fully returned for this dispatch.
                </Alert>
              </Box>
            )}

            {/* ---- Fully Returned Items (info only) ---- */}
            {fullyReturnedItems.length > 0 && (
              <Box sx={{ px: 2.5, pt: 2, pb: 2.5 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Fully returned items (no more quantity returnable):
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {fullyReturnedItems.map((item) => (
                    <Chip
                      key={item.dispatch_item}
                      size="small"
                      label={`${item.product_name} (${fmtNum(item.dispatched_qty, 2)} dispatched)`}
                      color="default"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, bgcolor: '#f8fafc' }}>
        <Button onClick={() => !submitting && onClose(null)} disabled={submitting} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || loading || returnableItems.length === 0}
          variant="contained"
          startIcon={submitting ? <CircularProgress size={16} /> : <AssignmentReturnIcon />}
          sx={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0d6efd 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #15305a 0%, #0b5ed7 100%)',
            },
          }}
        >
          {submitting ? 'Creating Return…' : 'Create Draft Return'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
