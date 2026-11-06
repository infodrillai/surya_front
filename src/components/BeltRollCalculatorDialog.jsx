import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import {
  calculateRequiredRoll,
  calculateProductionQtyFromRoll,
  calculateBeltComponents,
  getBeltDivisionFactor,
} from '../lib/beltBatchLogic';
import { fmtNum } from '../lib/format';

export default function BeltRollCalculatorDialog({ open, onClose, onApplyToBatch, defaultValues = {} }) {
  const [calcMode, setCalcMode] = useState('qty_to_roll'); // 'qty_to_roll' | 'roll_to_qty'
  const [length, setLength] = useState(defaultValues.length || 230);
  const [width, setWidth] = useState(defaultValues.width || 98);
  const [quantity, setQuantity] = useState(defaultValues.quantity || 100);
  const [availableRoll, setAvailableRoll] = useState(defaultValues.availableRoll || 16);
  const [holes, setHoles] = useState(defaultValues.holes || 4);
  const [manualFactor, setManualFactor] = useState(defaultValues.divisionFactor || '');

  const factor = useMemo(() => {
    return getBeltDivisionFactor(width, manualFactor);
  }, [width, manualFactor]);

  const requiredRollCalc = useMemo(() => {
    return calculateRequiredRoll({ length, quantity, width, divisionFactor: factor });
  }, [length, quantity, width, factor]);

  const rollToQtyCalc = useMemo(() => {
    return calculateProductionQtyFromRoll({ rollMeters: availableRoll, length, width, divisionFactor: factor });
  }, [availableRoll, length, width, factor]);

  const activeQty = calcMode === 'qty_to_roll' ? Number(quantity) : rollToQtyCalc.pcs;
  const components = useMemo(() => {
    return calculateBeltComponents({ quantity: activeQty, holes });
  }, [activeQty, holes]);

  const handleApply = () => {
    onApplyToBatch?.({
      length: Number(length),
      width: Number(width),
      planned_quantity: activeQty,
      roll_division_factor: factor,
      roll_required: Math.round(requiredRollCalc.rollMeters * 100) / 100,
      roll_available: calcMode === 'roll_to_qty' ? Number(availableRoll) : Math.round(requiredRollCalc.rollMeters * 100) / 100,
      holes: Number(holes),
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <CalculateOutlinedIcon sx={{ color: '#0369a1' }} />
        <span>Belt Roll &amp; Component Calculator</span>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Mode Selector */}
          <Stack direction="row" spacing={1}>
            <Button
              variant={calcMode === 'qty_to_roll' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setCalcMode('qty_to_roll')}
            >
              Formula 1: Calculate Required Roll (from Qty)
            </Button>
            <Button
              variant={calcMode === 'roll_to_qty' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setCalcMode('roll_to_qty')}
            >
              Formula 2: Calculate Output Qty (from Available Roll)
            </Button>
          </Stack>

          {/* Inputs Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <TextField
              label="Length (mm)"
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              helperText="Product length in mm"
              size="small"
            />
            <TextField
              label="Width (mm)"
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              helperText={width >= 84 && width <= 105 ? '84–105mm → Factor 3' : '106–150mm → Factor 2'}
              size="small"
            />
            <FormControl size="small">
              <InputLabel>Division Factor</InputLabel>
              <Select
                value={manualFactor || factor}
                label="Division Factor"
                onChange={(e) => setManualFactor(e.target.value)}
              >
                <MenuItem value={3}>3 (e.g. 84–105 mm)</MenuItem>
                <MenuItem value={2}>2 (e.g. 106–150 mm)</MenuItem>
              </Select>
            </FormControl>

            {calcMode === 'qty_to_roll' ? (
              <TextField
                label="Production Quantity (PCS)"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                helperText="Planned belt output quantity"
                size="small"
              />
            ) : (
              <TextField
                label="Available Roll (Meters)"
                type="number"
                value={availableRoll}
                onChange={(e) => setAvailableRoll(e.target.value)}
                helperText="Total available roll material in meters"
                size="small"
              />
            )}

            <TextField
              label="Holes per Belt"
              type="number"
              value={holes}
              onChange={(e) => setHoles(e.target.value)}
              helperText="Number of holes per piece"
              size="small"
            />
          </Box>

          {/* Live Calculation Output Card */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f0fdf4', borderColor: '#86efac', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534', mb: 1 }}>
              Calculation Result &amp; Formula Breakdown
            </Typography>

            {calcMode === 'qty_to_roll' ? (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d' }}>
                  Required Roll: {fmtNum(requiredRollCalc.rollMeters, 2)} Meters
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontFamily: 'monospace', color: '#1e293b' }}>
                  Formula: ({length} mm / 1000 × {quantity} PCS) / {factor} = {fmtNum(requiredRollCalc.rollMeters, 4)} m
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d' }}>
                  Production Output: {rollToQtyCalc.pcs} PCS
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontFamily: 'monospace', color: '#1e293b' }}>
                  Formula: {availableRoll} m × {factor} × 1000 / {length} mm = {fmtNum((availableRoll * factor * 1000) / length, 2)} → {rollToQtyCalc.pcs} PCS (Whole)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, color: '#0369a1', fontWeight: 600 }}>
                  Consumed Roll: {fmtNum(rollToQtyCalc.consumedRoll, 2)} m | Remaining Roll: {fmtNum(rollToQtyCalc.remainingRoll, 2)} m
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Configured Components Table */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Formula 3: Required Components for {activeQty} Belts
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
              <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary">Eyelets (Holes × 4 × Qty)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{components.eyelets}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary">Rivets (Holes × 4 × Qty)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{components.rivets}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary">Al. Patti (Qty × 2)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{components.aluminiumPatti}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary">Patti Rivets (Qty × 4)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{components.aluminiumPattiRivets}</Typography>
              </Box>
            </Box>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Close</Button>
        {onApplyToBatch && (
          <Button variant="contained" onClick={handleApply}>
            Apply to Batch
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

