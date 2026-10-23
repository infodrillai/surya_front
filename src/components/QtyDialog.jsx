import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function QtyDialog({ open, onClose, orderId, pendingItems = [], onSubmit }) {
  const [qtys, setQtys] = useState(() => buildDefault(pendingItems));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  // Re-initialise when pendingItems changes (dialog re-opens for a new order)
  React.useEffect(() => {
    setQtys(buildDefault(pendingItems));
    setErrors({});
    setApiError('');
  }, [pendingItems, open]);

  /** Default: blank so user must explicitly type a quantity. */
  function buildDefault(items) {
    return Object.fromEntries(items.map((i) => [i.order_item, '']));
  }

  function validate(orderItem, value, pendingQty) {
    const trimmed = String(value).trim();
    if (trimmed === '' || trimmed === '0') return null; // empty/zero is allowed (means skip)
    const num = Number(trimmed);
    if (isNaN(num) || num < 0) return 'Enter a valid number ≥ 0';
    if (num === 0) return null;
    if (num > pendingQty + 1e-9) return `Max ${pendingQty}`;
    // Whole-number check — if pending_qty is a whole number, dispatch qty must also be whole
    if (Number.isInteger(pendingQty) && !Number.isInteger(num)) return 'Must be a whole number';
    return null;
  }

  function handleChange(orderItem, value, pendingQty) {
    setQtys((prev) => ({ ...prev, [orderItem]: value }));
    const err = validate(orderItem, value, pendingQty);
    setErrors((prev) => {
      const n = { ...prev };
      if (err) n[orderItem] = err;
      else delete n[orderItem];
      return n;
    });
  }

  async function handleSubmit() {
    // Final validation pass
    const newErrors = {};
    let atLeastOne = false;
    for (const item of pendingItems) {
      const raw = qtys[item.order_item] ?? '';
      const trimmed = String(raw).trim();
      if (trimmed === '' || trimmed === '0') continue; // blank = skip this item
      const num = Number(trimmed);
      const err = validate(item.order_item, raw, item.pending_qty);
      if (err) {
        newErrors[item.order_item] = err;
      } else if (num > 0) {
        atLeastOne = true;
      }
    }
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    if (!atLeastOne) { setApiError('Enter a quantity > 0 for at least one item.'); return; }

    setSubmitting(true);
    setApiError('');
    try {
      const items = pendingItems
        .map((i) => ({ order_item: i.order_item, quantity: Number(qtys[i.order_item] || 0) }))
        .filter((i) => i.quantity > 0);
      const msg = await onSubmit(items);
      onClose(msg);
    } catch (err) {
      setApiError(err?.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => onClose(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack>
          <Typography variant="h6" fontWeight={700}>Convert to Dispatch</Typography>
          {orderId && (
            <Typography variant="caption" color="text.secondary">
              Sales Order: {orderId}
            </Typography>
          )}
        </Stack>
        <IconButton onClick={() => onClose(null)} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}

        {pendingItems.length === 0 ? (
          <Alert severity="info">No pending items to dispatch.</Alert>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Leave a field blank or 0 to skip that item. Enter only the quantity you want to dispatch now.
            </Alert>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Ordered</TableCell>
                  <TableCell align="right">Already Dispatched</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell align="right" sx={{ minWidth: 160 }}>Dispatch Now</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingItems.map((item) => (
                  <TableRow key={item.order_item} hover>
                    <TableCell>{item.product}</TableCell>
                    <TableCell align="right">{item.ordered_qty}</TableCell>
                    <TableCell align="right">{item.already_dispatched}</TableCell>
                    <TableCell align="right">{item.pending_qty}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        placeholder="0"
                        value={qtys[item.order_item] ?? ''}
                        onChange={(e) => handleChange(item.order_item, e.target.value, item.pending_qty)}
                        error={!!errors[item.order_item]}
                        helperText={errors[item.order_item]}
                        inputProps={{ min: 0, max: item.pending_qty, step: 1 }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Typography variant="caption" color="text.secondary">
                                / {item.pending_qty}
                              </Typography>
                            </InputAdornment>
                          ),
                        }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => onClose(null)} disabled={submitting} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || pendingItems.length === 0}
          variant="contained"
          color="primary"
        >
          {submitting ? 'Creating…' : 'Create Dispatch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
