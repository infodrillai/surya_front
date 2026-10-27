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
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InventoryIcon from '@mui/icons-material/InventoryOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { call } from '../api/client';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';

const RECEIPT_STATUS_COLOR = {
  Draft: 'default',
  Confirmed: 'success',
  Cancelled: 'error',
};

export default function GoodsReceiptDialog({ open, poName, onClose }) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [error, setError] = useState('');
  const [poData, setPoData] = useState(null);
  const [history, setHistory] = useState([]);

  // Form fields
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryNote, setDeliveryNote] = useState('');
  const [remarks, setRemarks] = useState('');
  const [receiveQtys, setReceiveQtys] = useState({}); // { [po_item]: number }

  const loadData = async () => {
    if (!poName) return;
    setLoading(true);
    setError('');
    try {
      const [data, pastReceipts] = await Promise.all([
        call('clssurya.api.get_purchase_order_receipt_items', { purchase_order: poName }),
        call('clssurya.api.get_purchase_order_receipts', { purchase_order: poName }),
      ]);
      setPoData(data);
      setHistory(pastReceipts || []);

      // Pre-fill quantities with pending quantities
      const initialQtys = {};
      (data.items || []).forEach((it) => {
        initialQtys[it.purchase_order_item] = it.pending_qty > 0 ? it.pending_qty : '';
      });
      setReceiveQtys(initialQtys);
    } catch (err) {
      setError(err?.message || 'Failed to load purchase order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && poName) {
      setTab(0);
      setReceiptDate(new Date().toISOString().slice(0, 10));
      setDeliveryNote('');
      setRemarks('');
      loadData();
    }
  }, [open, poName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQtyChange = (itemId, val, maxVal) => {
    if (val === '') {
      setReceiveQtys((prev) => ({ ...prev, [itemId]: '' }));
      return;
    }
    const num = Number(val);
    if (isNaN(num) || num < 0) return;
    setReceiveQtys((prev) => ({ ...prev, [itemId]: num }));
  };

  const handleFillAll = () => {
    if (!poData?.items) return;
    const all = {};
    poData.items.forEach((it) => {
      all[it.purchase_order_item] = it.pending_qty > 0 ? it.pending_qty : '';
    });
    setReceiveQtys(all);
  };

  const handleClearAll = () => {
    if (!poData?.items) return;
    const all = {};
    poData.items.forEach((it) => {
      all[it.purchase_order_item] = '';
    });
    setReceiveQtys(all);
  };

  // Validations
  let totalReceivedNow = 0;
  let hasOverReceipt = false;
  let validationError = '';

  (poData?.items || []).forEach((it) => {
    const q = Number(receiveQtys[it.purchase_order_item]) || 0;
    totalReceivedNow += q;
    if (q > it.pending_qty + 1e-6) {
      hasOverReceipt = true;
      validationError = `Row ${it.product}: receipt quantity (${q}) exceeds pending quantity (${it.pending_qty}).`;
    }
  });

  if (!validationError && totalReceivedNow <= 0) {
    validationError = 'Enter quantity to receive for at least one item.';
  }

  const handleConfirmReceipt = async () => {
    if (validationError) return;
    setSubmitting(true);
    setError('');
    try {
      const itemsPayload = (poData?.items || [])
        .filter((it) => (Number(receiveQtys[it.purchase_order_item]) || 0) > 0)
        .map((it) => ({
          purchase_order_item: it.purchase_order_item,
          product: it.product,
          received_qty: Number(receiveQtys[it.purchase_order_item]),
        }));

      const res = await call('clssurya.api.create_and_confirm_goods_receipt', {
        purchase_order: poName,
        posting_date: receiptDate,
        supplier_delivery_note: deliveryNote,
        remarks: remarks,
        items: itemsPayload,
      });

      onClose(`Goods Receipt ${res.name} confirmed successfully! Inventory updated.`);
    } catch (err) {
      setError(err?.message || 'Failed to confirm goods receipt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReceipt = async (receiptName) => {
    const ok = window.confirm(
      `Cancel Goods Receipt ${receiptName}? This will REVERSE the stock added by this receipt from Raw inventory.`
    );
    if (!ok) return;

    setCancellingId(receiptName);
    setError('');
    try {
      await call('clssurya.api.cancel_goods_receipt', { goods_receipt_name: receiptName });
      await loadData();
    } catch (err) {
      setError(err?.message || 'Failed to cancel receipt');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <InventoryIcon color="primary" />
          <Typography variant="h6" component="div">
            Goods Receipt — {poName}
          </Typography>
          {poData?.status && (
            <Chip
              size="small"
              label={poData.status}
              color={poData.status === 'Received' ? 'success' : poData.status === 'Partially Received' ? 'warning' : 'info'}
            />
          )}
        </Stack>
        <IconButton aria-label="close" onClick={() => onClose(null)} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab icon={<InventoryIcon fontSize="small" />} iconPosition="start" label="Receive Goods" />
          <Tab
            icon={<HistoryIcon fontSize="small" />}
            iconPosition="start"
            label={`Receipt History (${history.length})`}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ pt: 2.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading purchase order details…
            </Typography>
          </Box>
        ) : tab === 0 ? (
          /* ---- TAB 0: RECEIVE GOODS ---- */
          <Stack spacing={2.5}>
            {/* Header metadata summary */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary">Vendor</Typography>
                  <Typography variant="body2" fontWeight={600}>{poData?.vendor || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Order Date</Typography>
                  <Typography variant="body2">{fmtDate(poData?.posting_date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Ordered Quantity</Typography>
                  <Typography variant="body2">{fmtNum(poData?.total_ordered_qty)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Already Received</Typography>
                  <Typography variant="body2" color="success.main" fontWeight={600}>
                    {fmtNum(poData?.total_received_qty)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Pending Quantity</Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={600}>
                    {fmtNum(poData?.total_pending_qty)}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* Receipt form fields */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Receipt Date"
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                sx={{ width: { xs: '100%', sm: 200 } }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Supplier Delivery Note / Challan No"
                placeholder="e.g. DN-2026-987"
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                sx={{ flex: 1 }}
              />
            </Stack>

            <TextField
              label="Remarks"
              placeholder="Gate entry details, transporter notes, or quality remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />

            {/* Items table */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Items to Receive
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="text" onClick={handleFillAll}>
                    Receive All Remaining
                  </Button>
                  <Button size="small" variant="text" color="inherit" onClick={handleClearAll}>
                    Clear
                  </Button>
                </Stack>
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell>Product</TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="right">Ordered</TableCell>
                      <TableCell align="right">Already Received</TableCell>
                      <TableCell align="right">Pending</TableCell>
                      <TableCell align="right">Landed Cost</TableCell>
                      <TableCell align="right" sx={{ width: 170 }}>
                        Quantity Received Now
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(poData?.items || []).map((it) => {
                      const curVal = receiveQtys[it.purchase_order_item] ?? '';
                      const isOver = Number(curVal) > it.pending_qty + 1e-6;
                      return (
                        <TableRow key={it.purchase_order_item} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {it.product_name || it.product}
                            </Typography>
                            {it.product_name && it.product_name !== it.product && (
                              <Typography variant="caption" color="text.secondary">
                                {it.product}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">{it.uom || 'Unit'}</TableCell>
                          <TableCell align="right">{fmtNum(it.ordered_qty)}</TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary' }}>
                            {fmtNum(it.already_received_qty)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: 'warning.main' }}>
                            {fmtNum(it.pending_qty)}
                          </TableCell>
                          <TableCell align="right">{fmtMoney(it.landed_rate)}</TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              disabled={it.pending_qty <= 0}
                              value={curVal}
                              onChange={(e) => handleQtyChange(it.purchase_order_item, e.target.value, it.pending_qty)}
                              error={isOver}
                              helperText={isOver ? `Max: ${it.pending_qty}` : ''}
                              slotProps={{
                                htmlInput: { min: 0, max: it.pending_qty, step: 'any' },
                                input: {
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Typography variant="caption">{it.uom}</Typography>
                                    </InputAdornment>
                                  ),
                                },
                              }}
                              sx={{ width: 150 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Total summary alert */}
            {totalReceivedNow > 0 && !hasOverReceipt && (
              <Alert severity="info" icon={<CheckCircleIcon fontSize="inherit" />}>
                Total received now: <strong>{fmtNum(totalReceivedNow)}</strong>. On confirmation, Raw inventory will increase immediately by this quantity at allocated landed cost.
              </Alert>
            )}
          </Stack>
        ) : (
          /* ---- TAB 1: RECEIPT HISTORY ---- */
          <Box>
            {history.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  No goods receipts have been confirmed for this purchase order yet.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {history.map((h) => {
                  let grTotalQty = 0;
                  let grTotalVal = 0;
                  const itemRows = (h.items || []).map((row, idx) => {
                    const poItem = (poData?.items || []).find(
                      (it) => (row.purchase_order_item && it.purchase_order_item === row.purchase_order_item) || it.product === row.product
                    );
                    const rcvQty = Number(row.received_qty) || 0;
                    const cost = Number(row.cost) || Number(row.landed_rate) || Number(row.rate) || Number(poItem?.landed_rate) || Number(poItem?.rate) || 0;
                    const totalVal = Number(row.amount) || (rcvQty * cost);
                    const uom = row.uom || poItem?.uom || 'Unit';

                    grTotalQty += rcvQty;
                    grTotalVal += totalVal;

                    return {
                      ...row,
                      idx,
                      rcvQty,
                      cost,
                      totalVal,
                      uom,
                      displayName: row.product_name || poItem?.product_name || row.product,
                    };
                  });

                  return (
                    <Paper key={h.name} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" rowGap={0.5}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {h.name}
                          </Typography>
                          <Chip
                            size="small"
                            label={h.status}
                            color={RECEIPT_STATUS_COLOR[h.status] || 'default'}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Date: {fmtDate(h.posting_date)}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`Qty: ${fmtNum(grTotalQty)}`}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            color="primary"
                            label={`Total: ${fmtMoney(grTotalVal)}`}
                          />
                        </Stack>
                        {h.status === 'Confirmed' && (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={cancellingId === h.name}
                            onClick={() => handleCancelReceipt(h.name)}
                            startIcon={<CancelOutlinedIcon fontSize="small" />}
                          >
                            {cancellingId === h.name ? 'Cancelling…' : 'Cancel & Reverse Stock'}
                          </Button>
                        )}
                      </Stack>

                      {h.supplier_delivery_note && (
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          <strong>Delivery Note:</strong> {h.supplier_delivery_note}
                        </Typography>
                      )}
                      {h.remarks && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          <strong>Remarks:</strong> {h.remarks}
                        </Typography>
                      )}

                      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                              <TableCell>Product</TableCell>
                              <TableCell align="center">UOM</TableCell>
                              <TableCell align="right">Received Qty</TableCell>
                              <TableCell align="right">Cost</TableCell>
                              <TableCell align="right">Total Value</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {itemRows.map((row) => (
                              <TableRow key={row.idx} hover>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600}>
                                    {row.displayName}
                                  </Typography>
                                  {row.displayName !== row.product && (
                                    <Typography variant="caption" color="text.secondary">
                                      {row.product}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">{row.uom}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(row.rcvQty)}</TableCell>
                                <TableCell align="right">{fmtMoney(row.cost)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtMoney(row.totalVal)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          {itemRows.length > 0 && (
                            <TableFooter>
                              <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Total</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(grTotalQty)}</TableCell>
                                <TableCell align="right">-</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                  {fmtMoney(grTotalVal)}
                                </TableCell>
                              </TableRow>
                            </TableFooter>
                          )}
                        </Table>
                      </TableContainer>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={() => onClose(null)} color="inherit">
          Close
        </Button>
        {tab === 0 && (
          <Button
            variant="contained"
            color="primary"
            disabled={submitting || loading || !!validationError}
            onClick={handleConfirmReceipt}
            startIcon={submitting ? <CircularProgress size={16} /> : <CheckCircleIcon />}
          >
            {submitting ? 'Confirming…' : 'Confirm Receipt'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
