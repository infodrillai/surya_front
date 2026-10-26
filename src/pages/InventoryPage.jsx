import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  LinearProgress,
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
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined,
  CategoryOutlined,
  CheckCircleOutlineRounded,
  CloseRounded,
  ElectricBoltOutlined,
  FilterListRounded,
  GridViewRounded,
  InfoOutlined,
  Inventory2Outlined,
  PrecisionManufacturingOutlined,
  RefreshRounded,
  ScienceOutlined,
  SearchRounded,
  StraightenOutlined,
  TableRowsRounded,
  TuneOutlined,
  WarehouseOutlined,
  WarningAmberRounded,
  PieChartOutlined,
  CalendarMonthOutlined,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { getList, call } from '../api/client';
import { db } from '../db/dexie';
import { fmtDate, fmtDDMMYYYY, fmtMoney, fmtNum } from '../lib/format';
import { palette } from '../theme';
import { toInternalStage, toDisplayStage } from '../lib/stageLabels';

// Distinctive theme per stage
const STAGE_THEMES = {
  Raw: {
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    badgeBg: '#e0f2fe',
    badgeText: '#0369a1',
    label: 'Raw Material',
    Icon: ScienceOutlined,
    description: 'Purchased raw materials ready for Stage 1 production.',
  },
  'Stage 1': {
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    badgeBg: '#e0e7ff',
    badgeText: '#4338ca',
    label: 'Stage 1 (Insert Making)',
    Icon: PrecisionManufacturingOutlined,
    description: 'Semi-finished stock processed through Stage 1.',
  },
  'Stage 2': {
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    badgeBg: '#ede9fe',
    badgeText: '#6d28d9',
    label: 'Stage 2 (PU & Casting)',
    Icon: TuneOutlined,
    description: 'Intermediary semi-finished stock ready for final stage.',
  },
  'Stage 3': {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    badgeBg: '#fef3c7',
    badgeText: '#b45309',
    label: 'Stage 3 (CNC)',
    Icon: ElectricBoltOutlined,
    description: 'CNC stock waiting to be moved to Finished Goods.',
  },
  Finished: {
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    badgeBg: '#d1fae5',
    badgeText: '#047857',
    label: 'Finished Goods',
    Icon: CheckCircleOutlineRounded,
    description: 'Final goods in warehouse ready for sales dispatch.',
  },
};

const DEFAULT_STAGE_THEME = {
  color: palette.teal,
  bg: '#f3f6f5',
  border: '#dde5e3',
  badgeBg: '#e6f0ee',
  badgeText: palette.teal,
  label: 'Stock',
  Icon: WarehouseOutlined,
  description: 'Inventory in storage.',
};

function getStageTheme(stage) {
  return STAGE_THEMES[stage] || DEFAULT_STAGE_THEME;
}

// Multi-color Stacked Bar for Charge Bifurcation
function BifurcationStackedBar({ components = [], height = 7, sx = {} }) {
  if (!components || !components.length) return null;
  const total = components.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  if (total <= 0) return null;

  return (
    <Box
      sx={{
        width: '100%',
        height,
        borderRadius: height / 2,
        overflow: 'hidden',
        display: 'flex',
        bgcolor: '#e2e8f0',
        ...sx,
      }}
    >
      {components
        .filter((c) => Number(c.total) > 0)
        .map((c, idx) => {
          const widthPct = Math.max((Number(c.total) / total) * 100, 1.5);
          return (
            <Tooltip
              key={idx}
              arrow
              title={
                <Box sx={{ p: 0.5, textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: '#ffffff' }}>
                    {c.name}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 11, color: '#f1f5f9' }}>
                    Split: {fmtMoney(c.total, 2)} ({c.percent}%)
                  </Typography>
                  {Number(c.per_unit) > 0 && (
                    <Typography variant="caption" sx={{ fontSize: 10, display: 'block', color: 'rgba(255,255,255,0.8)' }}>
                      Rate: {fmtMoney(c.per_unit, 2)}/pc
                    </Typography>
                  )}
                </Box>
              }
            >
              <Box
                sx={{
                  width: `${widthPct}%`,
                  height: '100%',
                  bgcolor: c.color || '#0284c7',
                  transition: 'opacity 0.2s',
                  '&:hover': { opacity: 0.82, cursor: 'pointer' },
                }}
              />
            </Tooltip>
          );
        })}
    </Box>
  );
}

// Compact Charge Badges displaying the individual charge split amounts
function ChargeBadges({ costHeads, compact = false }) {
  if (!costHeads) return null;
  const items = [
    { key: 'material', ...costHeads.material },
    { key: 'labour', ...costHeads.labour },
    { key: 'cnc', ...costHeads.cnc },
    { key: 'admin', ...costHeads.admin },
    { key: 'rejection', ...costHeads.rejection },
    { key: 'electricity', ...costHeads.electricity },
  ].filter((h) => Number(h?.amount) > 0);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {items.map((h) => (
        <Tooltip
          key={h.key}
          arrow
          title={`${h.name}: ${fmtMoney(h.amount, 2)} (${h.percent}% of valuation) · ${fmtMoney(h.unit_rate, 2)}/pc`}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: compact ? 0.6 : 0.75,
              py: compact ? 0.15 : 0.25,
              borderRadius: '4px',
              bgcolor: '#f1f5f9',
              border: '1px solid #e2e8f0',
              fontSize: compact ? 10 : 10.5,
              fontWeight: 600,
              color: '#334155',
            }}
          >
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: h.color || '#0284c7', flexShrink: 0 }} />
            <span>{h.name?.split(' ')[0]}:</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtMoney(h.amount, compact ? 0 : 2)}</span>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

// KPI Summary Card Component
function StatCard({ label, value, subtitle, icon: Icon, iconBg, iconColor, alert }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: '14px',
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
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.02em' }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.75, mb: 0.5, fontWeight: 700, color: '#12262a' }}>
          {value}
        </Typography>
        {alert ? (
          <Box sx={{ mt: 0.5 }}>{alert}</Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '12px',
          bgcolor: iconBg,
          color: iconColor,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 24 }} />
      </Box>
    </Paper>
  );
}

// Individual Modern Inventory Card (Compact Style)
function InventoryCard({ item, onSelect }) {
  const stageTheme = getStageTheme(item.stage);
  const StageIcon = stageTheme.Icon;

  // Stock health status
  const isOutOfStock = Number(item.stock) <= 0;
  const isLowStock = !isOutOfStock && item.low_stock_limit > 0 && Number(item.stock) <= item.low_stock_limit;
  const isOverstocked = item.high_stock_limit > 0 && Number(item.stock) >= item.high_stock_limit;

  // Progress percentage against limits if available
  let stockPercentage = 50;
  if (item.high_stock_limit > 0) {
    stockPercentage = Math.min(100, Math.max(5, (Number(item.stock) / item.high_stock_limit) * 100));
  } else if (item.low_stock_limit > 0) {
    stockPercentage = Math.min(100, Math.max(10, (Number(item.stock) / (item.low_stock_limit * 2)) * 100));
  }

  return (
    <Paper
      variant="outlined"
      onClick={() => onSelect(item)}
      sx={{
        borderRadius: '12px',
        bgcolor: '#ffffff',
        border: '1px solid #dde5e3',
        borderTop: `3px solid ${stageTheme.color}`,
        p: 1.75,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 20px -6px rgba(14, 42, 47, 0.12)',
          borderColor: '#b2c8c4',
        },
      }}
    >
      <Box>
        {/* Top Badges */}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
          <Chip
            size="small"
            icon={<StageIcon sx={{ fontSize: '14px !important', color: `${stageTheme.badgeText} !important` }} />}
            label={stageTheme.label || item.stage}
            sx={{
              bgcolor: stageTheme.badgeBg,
              color: stageTheme.badgeText,
              fontWeight: 700,
              fontSize: 11,
              height: 22,
              borderRadius: '6px',
              border: `1px solid ${stageTheme.border}`,
            }}
          />

          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {item.product_type && (
              <Chip
                size="small"
                label={item.product_type}
                variant="outlined"
                sx={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  height: 20,
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  borderRadius: '5px',
                }}
              />
            )}

            {isLowStock ? (
              <Chip
                size="small"
                icon={<WarningAmberRounded sx={{ fontSize: '13px !important' }} />}
                label="Low"
                color="warning"
                sx={{ fontWeight: 700, fontSize: 10.5, height: 20, borderRadius: '5px' }}
              />
            ) : isOutOfStock ? (
              <Chip
                size="small"
                label="0"
                sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 10.5, height: 20, borderRadius: '5px' }}
              />
            ) : isOverstocked ? (
              <Chip
                size="small"
                label="High"
                sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600, fontSize: 10.5, height: 20, borderRadius: '5px' }}
              />
            ) : null}
          </Stack>
        </Stack>

        {/* Product Identity */}
        <Box sx={{ mb: 1.25 }}>
          <Typography
            variant="subtitle2"
            title={item.product_name}
            sx={{
              fontSize: 14.5,
              fontWeight: 700,
              color: '#12262a',
              lineHeight: 1.25,
              mb: 0.35,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.product_name}
          </Typography>

          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
            {toInternalStage(item.stage) === 'Finished' ? (
              <Chip
                size="small"
                label={item.production_code ? `Prod Code: ${item.production_code}` : (item.product_code || item.product)}
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 750,
                  fontSize: 11,
                  bgcolor: '#ecfdf5',
                  color: '#065f46',
                  border: '1px solid #a7f3d0',
                  height: 22,
                }}
              />
            ) : (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: 11,
                  color: '#475569',
                  bgcolor: '#f1f5f9',
                  px: 0.6,
                  py: 0.15,
                  borderRadius: '4px',
                }}
              >
                {item.product_code || item.product}
              </Typography>
            )}

            {item.category && (
              <Chip
                size="small"
                icon={<CategoryOutlined sx={{ fontSize: '12px !important' }} />}
                label={item.category}
                sx={{ height: 18, fontSize: 10.5, bgcolor: '#f3f6f5', color: '#52666a' }}
              />
            )}
          </Stack>
        </Box>

        {/* Compact Numeric Metrics Grid: 3 columns in 1 row */}
        <Paper
          elevation={0}
          sx={{
            p: 1.25,
            mb: 1.25,
            borderRadius: '8px',
            bgcolor: '#f7faf9',
            border: '1px solid #e7eeec',
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, alignItems: 'baseline' }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 600, display: 'block', lineHeight: 1 }}>
                Stock
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, color: '#12262a', lineHeight: 1.2, mt: 0.35 }}>
                {fmtNum(item.stock, 2)}{' '}
                <Typography component="span" sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 600 }}>
                  {item.uom || ''}
                </Typography>
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 600, display: 'block', lineHeight: 1 }}>
                Unit Cost
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155', lineHeight: 1.2, mt: 0.35 }}>
                {fmtMoney(item.unit_price, 2)}
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 600, display: 'block', lineHeight: 1 }}>
                Valuation
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, color: palette.teal, lineHeight: 1.2, mt: 0.35 }}>
                {fmtMoney(item.total_amount, 2)}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Charge Split Bifurcation */}
        {item.bifurcation && (
          <Box
            sx={{
              p: 1.25,
              mb: 1.25,
              borderRadius: '8px',
              bgcolor: '#ffffff',
              border: '1px solid #e7eeec',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.65 }}>
              <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: '#334155' }}>
                Charge Split Bifurcation
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: palette.teal }}>
                {fmtMoney(item.total_amount, 2)}
              </Typography>
            </Box>
            <BifurcationStackedBar components={item.bifurcation.components} height={6} sx={{ mb: 0.75 }} />
            <ChargeBadges costHeads={item.bifurcation.cost_heads} compact />
          </Box>
        )}

        {/* Stock Threshold Visual Meter (Slim) */}
        {(item.low_stock_limit > 0 || item.high_stock_limit > 0) && (
          <Box sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                {item.low_stock_limit > 0 ? `Min: ${fmtNum(item.low_stock_limit, 0)}` : 'Safe'}
              </Typography>
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: isLowStock ? 'warning.main' : 'text.secondary' }}>
                {isLowStock ? 'Below Min Limit' : 'In Range'}
              </Typography>
              <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                {item.high_stock_limit > 0 ? `Max: ${fmtNum(item.high_stock_limit, 0)}` : ''}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={stockPercentage}
              color={isLowStock ? 'warning' : 'primary'}
              sx={{
                height: 4,
                borderRadius: 2,
                bgcolor: '#e2e8f0',
              }}
            />
          </Box>
        )}
      </Box>

      {/* Card Footer */}
      <Box sx={{ pt: 1, mt: 0.5, borderTop: '1px solid #edf2f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.secondary' }}>
          {item.modified ? `Updated ${fmtDate(item.modified)}` : 'Real-time'}
        </Typography>

        <Button
          size="small"
          variant="text"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item);
          }}
          sx={{
            fontSize: 11.5,
            fontWeight: 700,
            color: palette.teal,
            py: 0.1,
            px: 0.75,
            minWidth: 0,
            '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.08)' },
          }}
        >
          Details →
        </Button>
      </Box>
    </Paper>
  );
}
// Detail Dialog for deep inspection
function DetailDialog({ item, open, onClose, onOpenMoveDialog, getEffectiveAvailableQty }) {
  const productKey = (item?.product_code || item?.product) ?? '';
  const stageTheme = getStageTheme(item?.stage);
  const StageIcon = stageTheme.Icon;

  const { data: batchRecords = [], isLoading: isBatchLoading } = useQuery({
    queryKey: ['datewise_production_item', productKey, item?.stage],
    queryFn: async () => {
      const stageParam = ['Stage 1', 'Stage 2', 'Stage 3'].includes(item?.stage) ? item?.stage : undefined;
      const res = await call('clssurya.api.get_datewise_production_inventory', {
        product: productKey,
        stage: stageParam,
      });
      return res || [];
    },
    enabled: !!open && !!productKey,
    staleTime: 10_000,
  });

  if (!item) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                bgcolor: stageTheme.badgeBg,
                color: stageTheme.badgeText,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <StageIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
                {item.product_name}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                {toInternalStage(item.stage) === 'Finished' ? (
                  <Chip
                    size="small"
                    label={`Production Code: ${item.production_code || item.product_code || item.product}`}
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 750,
                      fontSize: 11.5,
                      height: 22,
                      bgcolor: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                    }}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Product Code: <strong>{item.product_code || item.product}</strong>
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  • {stageTheme.label || item.stage}
                </Typography>
                {toInternalStage(item.stage) !== 'Finished' && item.production_code && (
                  <Chip
                    size="small"
                    label={`Production Code: ${item.production_code}`}
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 11,
                      height: 20,
                      bgcolor: '#f1f5f9',
                      color: palette.teal,
                    }}
                  />
                )}
              </Stack>
            </Box>
          </Stack>
          <IconButton size="small" onClick={onClose}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        <Stack spacing={2.5}>
          {/* Key Metrics Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1.5,
              p: 2,
              borderRadius: '12px',
              bgcolor: '#f8faf9',
              border: '1px solid #e7eeec',
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Stock on Hand
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#12262a', mt: 0.5 }}>
                {fmtNum(item.stock, 3)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.uom || 'units'}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Weighted Unit Rate
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#334155', mt: 0.5 }}>
                {fmtMoney(item.unit_price, 2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                per {item.uom || 'unit'}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Total Valuation
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: palette.teal, mt: 0.5 }}>
                {fmtMoney(item.total_amount, 2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current value
              </Typography>
            </Box>
          </Box>

          {/* Date-Wise Production & Batch Records Section */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: '12px',
              bgcolor: '#ffffff',
              borderColor: '#cbd5e1',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CalendarMonthOutlined sx={{ color: palette.teal, fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#0f172a' }}>
                  Date-Wise Production Records
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {batchRecords.length} batch record(s) found
              </Typography>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Production Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Batch No.</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Product Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Production Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Product Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Production Stage</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Produced Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Available Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>UOM</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isBatchLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 2 }}>
                        <LinearProgress />
                      </TableCell>
                    </TableRow>
                  ) : batchRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 2, color: 'text.secondary', fontSize: 12 }}>
                        No production batches recorded yet for this product.
                      </TableCell>
                    </TableRow>
                  ) : (
                    batchRecords.map((r) => {
                      const isProductFinished = item?.stage === 'Finished' || item?.stage === 'Finished Goods';
                      const isRowFinished = r.stage === 'Finished' || r.stage === 'Finished Goods' || r.stage_label === 'Finished Goods';
                      const isStage3 = (r.stage === 'Stage 3' || r.stage?.includes('3')) && !isRowFinished;
                      const effectiveAvail = getEffectiveAvailableQty ? getEffectiveAvailableQty(r) : Number(r.available_qty || r.produced_qty || 0);

                      return (
                        <TableRow key={(r.batch_no || r.name || '') + (r.stage || '')} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12 }}>
                            {fmtDDMMYYYY(r.production_date)}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 11.5 }}>
                            {isRowFinished && r.production_code ? `FG-${r.production_code}` : r.batch_no}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                            {isRowFinished
                              ? (r.production_code || r.product_code || item?.production_code || '-')
                              : (r.product_code || item?.product_code || item?.product || '-')}
                          </TableCell>
                          <TableCell>
                            {r.production_code ? (
                              <Chip
                                size="small"
                                label={r.production_code}
                                sx={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#0f766e', height: 20 }}
                              />
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11.5 }}>-</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                              {r.product_name || item?.product_name || item?.product || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={r.stage_label || r.stage}
                              sx={{
                                height: 19,
                                fontSize: 10.5,
                                fontWeight: 700,
                                bgcolor: getStageTheme(r.stage).badgeBg,
                                color: getStageTheme(r.stage).badgeText,
                              }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: 12, fontWeight: 650 }}>
                            {fmtNum(r.produced_qty, 2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: effectiveAvail > 0 ? '#059669' : 'text.secondary' }}>
                            {fmtNum(effectiveAvail, 2)}
                          </TableCell>
                          <TableCell sx={{ fontSize: 11.5 }}>
                            {r.uom || item?.uom || 'PCS'}
                          </TableCell>
                          <TableCell align="right">
                            {(!isProductFinished && isStage3) ? (
                              effectiveAvail > 0 ? (
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => onOpenMoveDialog?.({
                                    ...r,
                                    product: r.product_code || item?.product_code || item?.product,
                                    product_name: r.product_name || item?.product_name || item?.product,
                                    batch_no: r.batch_no || r.name,
                                    production_date: r.production_date,
                                    production_code: r.production_code || item?.production_code,
                                    available_qty: effectiveAvail,
                                    produced_qty: Number(r.produced_qty || r.quantity || 0),
                                    uom: r.uom || item?.uom || 'PCS',
                                  })}
                                  sx={{
                                    fontSize: 10.5,
                                    py: 0.3,
                                    px: 1.2,
                                    borderRadius: '6px',
                                    bgcolor: '#059669',
                                    '&:hover': { bgcolor: '#047857' },
                                    textTransform: 'none',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  Move to Finished Goods
                                </Button>
                              ) : (
                                <Chip
                                  size="small"
                                  label="Finished"
                                  sx={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    bgcolor: '#ecfdf5',
                                    color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    height: 22,
                                  }}
                                />
                              )
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11.5 }}>—</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Cost & Valuation Bifurcation (Charge Split) */}
          {item.bifurcation && (
            <Paper
              variant="outlined"
              sx={{
                p: 2.25,
                borderRadius: '12px',
                bgcolor: '#ffffff',
                borderColor: '#cbd5e1',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
                <PieChartOutlined sx={{ color: palette.teal, fontSize: 22 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 750, color: '#0f172a' }}>
                  Cost & Valuation Bifurcation (Charge Split)
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Split of current <strong>{fmtMoney(item.total_amount, 2)}</strong> valuation and{' '}
                <strong>{fmtMoney(item.unit_price, 2)}</strong> unit cost across production charges and raw materials:
              </Typography>

              {/* High-Level Cost Head Summary Grid */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                  gap: 1.5,
                  mb: 2,
                }}
              >
                {Object.entries(item.bifurcation.cost_heads || {})
                  .filter(([_, h]) => Number(h?.amount) > 0 || Number(h?.unit_rate) > 0)
                  .map(([key, head]) => (
                    <Paper
                      key={key}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: '8px',
                        bgcolor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderLeft: `4px solid ${head.color || '#0284c7'}`,
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
                        {head.name}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                        {fmtMoney(head.amount, 2)}
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.secondary', fontWeight: 600 }}>
                        {fmtMoney(head.unit_rate, 2)}/pc • {head.percent}%
                      </Typography>
                    </Paper>
                  ))}
              </Box>

              {/* Large Stacked Visual Bar */}
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', display: 'block', mb: 0.75 }}>
                  Proportional Split of Unit Cost ({fmtMoney(item.unit_price, 2)})
                </Typography>
                <BifurcationStackedBar components={item.bifurcation.components} height={12} />
              </Box>

              {/* Detailed Itemized Components Table */}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#1e293b' }}>
                Itemized Charges & Material Breakdown
              </Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Charge / Component</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Category</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Per Unit Rate</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Unit Share</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Total Valuation Split</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(item.bifurcation.components || []).map((comp, cIdx) => (
                      <TableRow key={cIdx} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: comp.color || '#0284c7' }} />
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                              {comp.name}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={comp.category}
                            sx={{
                              height: 18,
                              fontSize: 10,
                              fontWeight: 600,
                              bgcolor: comp.category === 'Material' ? '#e0f2fe' : comp.category === 'Rejection' ? '#fee2e2' : '#fef3c7',
                              color: comp.category === 'Material' ? '#0369a1' : comp.category === 'Rejection' ? '#b91c1c' : '#b45309',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
                            {fmtMoney(comp.per_unit, 2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
                            {comp.percent}%
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 750, color: palette.teal }}>
                            {fmtMoney(comp.total, 2)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* Product Specifications */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#12262a' }}>
              Product & Stage Details
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1.5,
                bgcolor: '#ffffff',
                border: '1px solid #dde5e3',
                borderRadius: '10px',
                p: 2,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Product Type
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.product_type || '-'}
                </Typography>
              </Box>

              {item.production_code && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Production Code
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f766e' }}>
                    {item.production_code}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Category
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.category || 'Uncategorized'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Unit of Measure (UOM)
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.uom || '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Stage Purpose
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: stageTheme.badgeText }}>
                  {stageTheme.label}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Thresholds */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#12262a' }}>
              Stock Limit Thresholds
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1.5,
                bgcolor: '#ffffff',
                border: '1px solid #dde5e3',
                borderRadius: '10px',
                p: 2,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Low Stock Limit
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: item.low_stock_limit > 0 ? 'warning.main' : 'text.primary' }}>
                  {item.low_stock_limit > 0 ? `${fmtNum(item.low_stock_limit, 2)} ${item.uom || ''}` : 'Not set'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  High Stock Limit
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.high_stock_limit > 0 ? `${fmtNum(item.high_stock_limit, 2)} ${item.uom || ''}` : 'Not set'}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Process / Flow Guide Note */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: '10px',
              bgcolor: stageTheme.bg,
              borderColor: stageTheme.border,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: stageTheme.badgeText, display: 'block', mb: 0.5 }}>
              Stage Information
            </Typography>
            <Typography variant="body2" sx={{ color: '#334155' }}>
              {stageTheme.description}
            </Typography>
          </Paper>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {item.stage === 'Stage 3' && Number(item.stock) > 0 && (
            <Button
              variant="contained"
              onClick={() => {
                onClose();
                onMoveToFinished?.(item);
              }}
              sx={{
                borderRadius: '8px',
                bgcolor: '#059669',
                '&:hover': { bgcolor: '#047857' },
                px: 2.5,
                fontWeight: 700,
              }}
            >
              Move to Finished Goods
            </Button>
          )}

          {item.stage === 'Finished' && (
            <Button
              variant="outlined"
              color="warning"
              onClick={async () => {
                const ok = window.confirm(`Move ${item.product_name || item.product} back to Stage 3?`);
                if (!ok) return;
                try {
                  await call('clssurya.api.move_to_stage3', {
                    product: item.product || item.product_code,
                    name: item.name,
                  });
                  alert(`Successfully moved ${item.product_name || item.product} to Stage 3!`);
                  onClose();
                  window.location.reload();
                } catch (e) {
                  try {
                    await call('frappe.client.set_value', {
                      doctype: 'Inventory',
                      name: item.name,
                      fieldname: 'stage',
                      value: 'Stage 3',
                    });
                    alert(`Successfully moved ${item.product_name || item.product} to Stage 3!`);
                    onClose();
                    window.location.reload();
                  } catch (err2) {
                    alert('Error: ' + (e.message || err2.message || 'Failed'));
                  }
                }
              }}
              sx={{ borderRadius: '8px', fontWeight: 650, textTransform: 'none' }}
            >
              Move to Stage 3
            </Button>
          )}
        </Box>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: '8px', px: 3 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Main Modern Inventory Page Component
export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('value-desc');
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'table' | 'datewise'
  const [selectedItem, setSelectedItem] = useState(null);

  // Partial transfer tracking map: { [batch_no]: total_transferred_qty }
  const [transferredMap, setTransferredMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('batch_transfers_map') || '{}');
    } catch {
      return {};
    }
  });

  const recordTransfer = (batchNo, qty) => {
    if (!batchNo) return;
    setTransferredMap((prev) => {
      const next = { ...prev, [batchNo]: (prev[batchNo] || 0) + Number(qty) };
      localStorage.setItem('batch_transfers_map', JSON.stringify(next));
      return next;
    });
  };

  const getEffectiveAvailableQty = (r) => {
    const raw = Number(
      r.available_qty > 0
        ? r.available_qty
        : r.good_output_qty > 0
        ? r.good_output_qty
        : r.produced_qty || r.quantity || r.stock || 0
    );
    const transferred = transferredMap[r.batch_no || r.name] || 0;
    return Math.max(0, raw - transferred);
  };

  // Move-to-Finished Goods dialog state
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveProdCode, setMoveProdCode] = useState('');
  const [moveLocation, setMoveLocation] = useState('Finished Goods Warehouse');
  const [moveRemarks, setMoveRemarks] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);

  const openMoveDialog = (item, e) => {
    if (e) e.stopPropagation();
    const avail = getEffectiveAvailableQty(item);
    setMoveTarget({ ...item, available_qty: avail });
    setMoveQty(String(avail > 0 ? avail : ''));
    setMoveProdCode(item.production_code || '');
    setMoveLocation('Finished Goods Warehouse');
    setMoveRemarks('');
  };

  const handleTransferConfirm = async () => {
    const qty = Number(moveQty);
    if (!qty || qty <= 0) {
      alert('Please enter a valid transfer quantity greater than 0');
      return;
    }
    const maxAvail = Number(moveTarget?.available_qty || 0);
    if (qty > maxAvail) {
      alert(`Cannot transfer more than available quantity (${fmtNum(maxAvail, 2)} ${moveTarget?.uom || 'PCS'})`);
      return;
    }

    setMoveLoading(true);
    try {
      const res = await call('clssurya.api.move_to_finished', {
        product: moveTarget.product || moveTarget.product_code,
        qty,
        batch_no: moveTarget.batch_no || moveTarget.name || '',
        production_code: moveProdCode || moveTarget.production_code || '',
        destination_location: moveLocation,
        remarks: moveRemarks || `Transfer of ${qty} to Finished Goods`,
      });

      if (moveTarget?.batch_no || moveTarget?.name) {
        recordTransfer(moveTarget.batch_no || moveTarget.name, qty);
      }

      // Store production_code locally so Finished Goods immediately reflects it
      if (moveProdCode) {
        try {
          const targetKey = moveTarget.product || moveTarget.product_code;
          const saved = JSON.parse(localStorage.getItem('finished_prod_codes') || '{}');
          saved[targetKey] = moveProdCode;
          if (moveTarget.product_code) saved[moveTarget.product_code] = moveProdCode;
          if (moveTarget.product_name) saved[moveTarget.product_name] = moveProdCode;
          localStorage.setItem('finished_prod_codes', JSON.stringify(saved));
        } catch (_) {}
      }

      // Optimistically update React Query cache for Inventory
      qc.setQueryData(['list', 'Inventory'], (old) => {
        if (!old || !Array.isArray(old)) return old;
        const targetProduct = moveTarget.product || moveTarget.product_code;
        let fgFound = false;
        const updated = old.map((inv) => {
          if (inv.product === targetProduct && (inv.stage === 'Stage 3' || toInternalStage(inv.stage) === 'Stage 3')) {
            return { ...inv, stock: Math.max(0, (Number(inv.stock) || 0) - qty) };
          }
          if (inv.product === targetProduct && (inv.stage === 'Finished' || toInternalStage(inv.stage) === 'Finished')) {
            fgFound = true;
            return {
              ...inv,
              stock: (Number(inv.stock) || 0) + qty,
              production_code: moveProdCode || inv.production_code,
            };
          }
          return inv;
        });
        if (!fgFound) {
          updated.push({
            name: `FG-${targetProduct}`,
            product: targetProduct,
            stage: 'Finished',
            stock: qty,
            production_code: moveProdCode,
            unit_price: moveTarget.unit_cost || 0,
            total_amount: qty * (moveTarget.unit_cost || 0),
          });
        }
        return updated;
      });

      alert(res?.message || `Successfully transferred ${qty} ${moveTarget?.uom || 'PCS'} to Finished Goods!`);
      setMoveTarget(null);
      refetch();
      if (viewMode === 'datewise') refetchDatewise();
      qc.invalidateQueries({ queryKey: ['datewise_production_item'] });
      qc.invalidateQueries({ queryKey: ['datewise_production'] });
      qc.invalidateQueries({ queryKey: ['all_datewise_production_inventory'] });
      qc.invalidateQueries({ queryKey: ['list', 'Inventory'] });
    } catch (err) {
      alert('Error moving to Finished Goods: ' + (err?.message || 'Transfer failed'));
    } finally {
      setMoveLoading(false);
    }
  };

  // Date-wise Production records filter states
  const [datewiseFrom, setDatewiseFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [datewiseTo, setDatewiseTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [datewiseProduct, setDatewiseProduct] = useState('');
  const [datewiseProdCode, setDatewiseProdCode] = useState('');
  const [datewiseBatchNo, setDatewiseBatchNo] = useState('');
  const [datewiseStage, setDatewiseStage] = useState('All');

  const { data: datewiseRecords = [], isLoading: isDatewiseLoading, refetch: refetchDatewise } = useQuery({
    queryKey: ['datewise_production', datewiseFrom, datewiseTo, datewiseProduct, datewiseProdCode, datewiseBatchNo, datewiseStage],
    queryFn: async () => {
      const res = await call('clssurya.api.get_datewise_production_inventory', {
        from_date: datewiseFrom,
        to_date: datewiseTo,
        product: datewiseProduct || undefined,
        production_code: datewiseProdCode || undefined,
        batch_no: datewiseBatchNo || undefined,
        stage: datewiseStage !== 'All' ? datewiseStage : undefined,
      });
      return res || [];
    },
    enabled: viewMode === 'datewise',
    staleTime: 10_000,
  });

  const handleMoveAllToFinished = async (item, e) => {
    if (e) e.stopPropagation();
    // Resolve quantity from any positive field candidate
    const candidateQty = [
      item?.available_qty,
      item?.good_output_qty,
      item?.produced_qty,
      item?.stock,
      item?.quantity,
    ];
    let qty = 0;
    for (const val of candidateQty) {
      const n = Number(val);
      if (!isNaN(n) && n > 0) {
        qty = n;
        break;
      }
    }

    if (!qty || qty <= 0) {
      alert('No quantity available to move to Finished Goods.');
      return;
    }
    const label = item?.batch_no ? `Batch ${item.batch_no}` : (item?.product_name || item?.product || 'item');
    const ok = window.confirm(
      `Move all ${fmtNum(qty, 2)} ${item?.uom || 'PCS'} of ${label} to Finished Goods?`
    );
    if (!ok) return;

    try {
      const res = await call('clssurya.api.move_to_finished', {
        product: item.product || item.product_code,
        qty,
        batch_no: item.batch_no || item.name || '',
        production_code: item.production_code || '',
        destination_location: 'Finished Goods Warehouse',
        remarks: `Moved full quantity of ${item.batch_no || item.product || ''}`.trim(),
      });
      if (item?.batch_no || item?.name) {
        markBatchAsMoved(item.batch_no || item.name);
      }
      alert(res?.message || `Successfully moved all ${fmtNum(qty, 2)} ${item?.uom || 'PCS'} to Finished Goods!`);
      refetch();
      refetchDatewise();
      qc.invalidateQueries({ queryKey: ['datewise_production_item'] });
      qc.invalidateQueries({ queryKey: ['datewise_production'] });
    } catch (err) {
      alert('Error: ' + (err?.message || 'Move failed'));
    }
  };

  // Fetch Inventory from server (or cache)
  const { data: serverInventory = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['list', 'Inventory'],
    queryFn: () => getList('Inventory'),
  });

  // Fetch charge bifurcation for all inventory items
  const { data: serverBifurcation = {}, refetch: refetchBifurcation } = useQuery({
    queryKey: ['inventoryBifurcation'],
    queryFn: () => call('clssurya.api.get_inventory_bifurcation', {}, { get: true }),
    staleTime: 20 * 1000,
  });

  // Batch queries to compute accurate Unit Cost and Valuation for Stage 1, Stage 2, Stage 3
  const { data: stage1Batches = [] } = useQuery({
    queryKey: ['list', 'Stage 1 Batch'],
    queryFn: () => getList('Stage 1 Batch').catch(() => []),
    staleTime: 60 * 1000,
  });

  const { data: stage2Batches = [] } = useQuery({
    queryKey: ['list', 'Stage 2 Batch'],
    queryFn: () => getList('Stage 2 Batch').catch(() => []),
    staleTime: 60 * 1000,
  });

  const { data: stage3Batches = [] } = useQuery({
    queryKey: ['list', 'Stage 3 Batch'],
    queryFn: () => getList('Stage 3 Batch').catch(() => []),
    staleTime: 60 * 1000,
  });

  // Query all production batches across stages for valuation tracking
  const { data: allDatewiseBatches = [] } = useQuery({
    queryKey: ['all_datewise_production_inventory'],
    queryFn: () => call('clssurya.api.get_datewise_production_inventory', {}).catch(() => []),
    staleTime: 30 * 1000,
  });

  // Masters from IndexedDB (Dexie)
  const products = useLiveQuery(() => db.Product.toArray(), []) || [];
  const categories = useLiveQuery(() => db.Category.toArray(), []) || [];
  const boms = useLiveQuery(() => db.BOM.toArray(), []) || [];

  // Map product master by name/code for quick enrichment
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.name) map.set(p.name, p);
      if (p.product_code) map.set(p.product_code, p);
      if (p.product_name) map.set(p.product_name, p);
    });
    return map;
  }, [products]);

  // Compute standard BOM-based valuation fallback for Stage 1 and Stage 2
  const bomCostMap = useMemo(() => {
    const map = new Map();
    const rawCostMap = new Map();
    (serverInventory || []).forEach((inv) => {
      const isRaw = inv.stage === 'Raw' || toInternalStage(inv.stage) === 'Raw';
      const up = Number(inv.unit_price) || 0;
      if (isRaw && up > 0) {
        rawCostMap.set(inv.product, up);
      }
    });

    boms.forEach((bom) => {
      if (!bom.name) return;
      const p = productMap.get(bom.name);

      // Stage 1 BOM calculation
      let s1Cost = 0;
      (bom.stage1_items || []).forEach((row) => {
        const util = Number(row.per_unit_utilization) || 0;
        const rawP = productMap.get(row.product);
        const price =
          Number(row.unit_price) ||
          rawCostMap.get(row.product) ||
          Number(rawP?.valuation_rate) ||
          Number(rawP?.standard_rate) ||
          0;
        s1Cost += util * price;
      });

      // Stage 2 BOM calculation
      let s2Added = 0;
      (bom.stage2_items || []).forEach((row) => {
        const util = Number(row.per_unit_utilization) || 0;
        const rawP = productMap.get(row.product);
        const price =
          Number(row.unit_price) ||
          rawCostMap.get(row.product) ||
          Number(rawP?.valuation_rate) ||
          Number(rawP?.standard_rate) ||
          0;
        s2Added += util * price;
      });
      const s2Cost = s1Cost + s2Added;

      // Register Stage 1 BOM costs
      if (s1Cost > 0) {
        ['Stage 1', 'Stage 1 (Insert Making)', 'Insert Making', 'Insert'].forEach((stg) => {
          map.set(`${stg}_${bom.name}`, s1Cost);
          if (p?.product_code) map.set(`${stg}_${p.product_code}`, s1Cost);
          if (p?.product_name) map.set(`${stg}_${p.product_name}`, s1Cost);
        });
      }

      // Register Stage 2 BOM costs
      if (s2Cost > 0) {
        ['Stage 2', 'Stage 2 (PU & Casting)', 'PU & Casting', 'Casting'].forEach((stg) => {
          map.set(`${stg}_${bom.name}`, s2Cost);
          if (p?.product_code) map.set(`${stg}_${p.product_code}`, s2Cost);
          if (p?.product_name) map.set(`${stg}_${p.product_name}`, s2Cost);
        });
      }
    });

    return map;
  }, [boms, productMap, serverInventory]);

  // Map of unit_cost per stage and product from saved batches & datewise production records
  const stageBatchCostMap = useMemo(() => {
    const map = new Map();

    const registerCost = (stage, prodKey, cost) => {
      if (!prodKey || !cost || cost <= 0) return;
      const cleanProd = String(prodKey).trim();
      const internal = toInternalStage(stage) || stage;
      const display = toDisplayStage(internal) || stage;

      const stageVariants = new Set([stage, internal, display]);
      if (internal === 'Stage 1') {
        stageVariants.add('Stage 1');
        stageVariants.add('Stage 1 (Insert Making)');
        stageVariants.add('Insert Making');
        stageVariants.add('Insert');
      } else if (internal === 'Stage 2') {
        stageVariants.add('Stage 2');
        stageVariants.add('Stage 2 (PU & Casting)');
        stageVariants.add('PU & Casting');
        stageVariants.add('Casting');
      } else if (internal === 'Stage 3') {
        stageVariants.add('Stage 3');
        stageVariants.add('Stage 3 (CNC)');
        stageVariants.add('CNC');
        stageVariants.add('CNC / Charge');
      } else if (internal === 'Finished') {
        stageVariants.add('Finished');
        stageVariants.add('Finished Goods');
      }

      stageVariants.forEach((stg) => {
        const k = `${stg}_${cleanProd}`;
        if (!map.has(k)) {
          map.set(k, cost);
        }
      });
    };

    const processBatch = (b, stageName) => {
      if (!b) return;
      let cost = Number(b.unit_cost) || 0;
      const qty = Number(b.quantity || b.produced_qty) || 0;
      const total = Number(b.batch_total) || 0;
      if (cost <= 0 && total > 0 && qty > 0) {
        cost = total / qty;
      }
      if (cost <= 0 && (Number(b.carried_cost) > 0 || Number(b.added_cost) > 0) && qty > 0) {
        cost = ((Number(b.carried_cost) || 0) + (Number(b.added_cost) || 0)) / qty;
      }
      if (cost <= 0) return;

      const prodVal = b.product || b.product_code || b.product_name;
      if (!prodVal) return;

      registerCost(stageName, prodVal, cost);

      const p = productMap.get(prodVal) || productMap.get(b.product_code) || productMap.get(b.product_name);
      if (p) {
        if (p.name) registerCost(stageName, p.name, cost);
        if (p.product_code) registerCost(stageName, p.product_code, cost);
        if (p.product_name) registerCost(stageName, p.product_name, cost);
      }
    };

    (stage1Batches || []).forEach((b) => processBatch(b, 'Stage 1'));
    (stage2Batches || []).forEach((b) => processBatch(b, 'Stage 2'));
    (stage3Batches || []).forEach((b) => processBatch(b, 'Stage 3'));

    (allDatewiseBatches || []).forEach((r) => {
      const stageName =
        r.stage ||
        (r.batch_no?.startsWith('STG1')
          ? 'Stage 1'
          : r.batch_no?.startsWith('STG2')
          ? 'Stage 2'
          : r.batch_no?.startsWith('STG3')
          ? 'Stage 3'
          : 'Finished');
      processBatch(r, stageName);
    });

    return map;
  }, [stage1Batches, stage2Batches, stage3Batches, allDatewiseBatches, productMap]);

  // Enriched inventory items with live batch valuation for Stage 1, Stage 2, and Stage 3
  const enrichedItems = useMemo(() => {
    let savedCodes = {};
    try {
      savedCodes = JSON.parse(localStorage.getItem('finished_prod_codes') || '{}');
    } catch (_) {}

    return serverInventory.map((item) => {
      const p = productMap.get(item.product);
      const bifKey = `${item.product}_${item.stage}`;
      const bif = serverBifurcation[bifKey] || null;

      const stock = Number(item.stock) || 0;
      const internalStage = toInternalStage(item.stage) || item.stage;

      // Batch unit cost lookup across aliases
      const candidateKeys = [
        `${item.stage}_${item.product}`,
        `${internalStage}_${item.product}`,
        `${item.stage}_${p?.product_code}`,
        `${internalStage}_${p?.product_code}`,
        `${item.stage}_${p?.product_name}`,
        `${internalStage}_${p?.product_name}`,
        `${item.stage}_${p?.name}`,
        `${internalStage}_${p?.name}`,
      ];

      let batchUnitCost = 0;
      for (const k of candidateKeys) {
        if (k && stageBatchCostMap.has(k)) {
          batchUnitCost = stageBatchCostMap.get(k);
          if (batchUnitCost > 0) break;
        }
      }

      // BOM unit cost lookup across aliases
      let bomCost = 0;
      for (const k of candidateKeys) {
        if (k && bomCostMap.has(k)) {
          bomCost = bomCostMap.get(k);
          if (bomCost > 0) break;
        }
      }

      // Bifurcation unit cost if available
      let bifUnitCost = 0;
      if (bif?.components && Array.isArray(bif.components)) {
        bifUnitCost = bif.components.reduce((sum, c) => sum + (Number(c.per_unit) || 0), 0);
      }

      // Unit price hierarchy: item.unit_price -> batchUnitCost -> bomCost -> bifUnitCost -> p.production_cost -> p.valuation_rate
      let unit_price = Number(item.unit_price) || 0;
      if (unit_price <= 0 && batchUnitCost > 0) {
        unit_price = batchUnitCost;
      }
      if (unit_price <= 0 && bomCost > 0) {
        unit_price = bomCost;
      }
      if (unit_price <= 0 && bifUnitCost > 0) {
        unit_price = bifUnitCost;
      }
      if (unit_price <= 0 && p?.production_cost > 0) {
        unit_price = Number(p.production_cost);
      }
      if (unit_price <= 0 && p?.valuation_rate > 0) {
        unit_price = Number(p.valuation_rate);
      }
      if (unit_price <= 0 && p?.standard_rate > 0) {
        unit_price = Number(p.standard_rate);
      }

      // Total valuation: from item.total_amount, fallback to stock * unit_price
      let total_amount = Number(item.total_amount) || 0;
      if (total_amount <= 0 && stock > 0 && unit_price > 0) {
        total_amount = stock * unit_price;
      } else if (total_amount > 0 && unit_price <= 0 && stock > 0) {
        unit_price = total_amount / stock;
      }

      // Production code: item.production_code, fallback to savedCodes, fallback to product
      const production_code =
        item.production_code ||
        savedCodes[item.product] ||
        savedCodes[p?.product_code] ||
        savedCodes[p?.name] ||
        p?.production_code ||
        '';

      return {
        ...item,
        product_name: p?.product_name || item.product,
        product_code: p?.product_code || item.product,
        production_code,
        product_type: p?.product_type || '',
        uom: p?.uom || '',
        category: p?.category || '',
        low_stock_limit: Number(p?.low_stock_limit) || 0,
        high_stock_limit: Number(p?.high_stock_limit) || 0,
        stock,
        unit_price,
        total_amount,
        bifurcation: bif,
      };
    });
  }, [serverInventory, productMap, serverBifurcation, stageBatchCostMap, bomCostMap]);

  // Warehouse Valuation Bifurcation across Production Charges
  const warehouseBifurcation = useMemo(() => {
    const totals = {
      material: 0,
      rejection: 0,
      labour: 0,
      electricity: 0,
      cnc: 0,
      admin: 0,
    };
    enrichedItems.forEach((item) => {
      if (item.bifurcation?.cost_heads) {
        Object.entries(item.bifurcation.cost_heads).forEach(([k, v]) => {
          if (totals[k] !== undefined) {
            totals[k] += Number(v?.amount) || 0;
          }
        });
      } else {
        totals.material += Number(item.total_amount) || 0;
      }
    });
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return {
      heads: [
        { key: 'material', name: 'Raw Materials', amount: totals.material, percent: (totals.material / grandTotal) * 100, color: '#0284c7' },
        { key: 'labour', name: 'Labour Expense', amount: totals.labour, percent: (totals.labour / grandTotal) * 100, color: '#f59e0b' },
        { key: 'cnc', name: 'CNC Repair & Tooling', amount: totals.cnc, percent: (totals.cnc / grandTotal) * 100, color: '#10b981' },
        { key: 'admin', name: 'Admin Expense', amount: totals.admin, percent: (totals.admin / grandTotal) * 100, color: '#64748b' },
        { key: 'rejection', name: 'Rejection Cost', amount: totals.rejection, percent: (totals.rejection / grandTotal) * 100, color: '#ef4444' },
        { key: 'electricity', name: 'Electricity', amount: totals.electricity, percent: (totals.electricity / grandTotal) * 100, color: '#eab308' },
      ].filter((h) => h.amount > 0),
      grandTotal,
    };
  }, [enrichedItems]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalValuation = enrichedItems.reduce((acc, curr) => acc + curr.total_amount, 0);
    const totalQty = enrichedItems.reduce((acc, curr) => acc + curr.stock, 0);
    const lowStockCount = enrichedItems.filter(
      (i) => i.low_stock_limit > 0 && i.stock > 0 && i.stock <= i.low_stock_limit
    ).length;
    const outOfStockCount = enrichedItems.filter((i) => i.stock <= 0).length;

    // Stage counts
    const stageCounts = {
      All: enrichedItems.length,
      Raw: 0,
      'Stage 1': 0,
      'Stage 2': 0,
      'Stage 3': 0,
      Finished: 0,
    };

    enrichedItems.forEach((i) => {
      if (stageCounts[i.stage] !== undefined) {
        stageCounts[i.stage] += 1;
      }
    });

    return {
      totalValuation,
      totalQty,
      lowStockCount,
      outOfStockCount,
      stageCounts,
    };
  }, [enrichedItems]);

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    let items = [...enrichedItems];

    // Search query filter
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.product_name.toLowerCase().includes(q) ||
          i.product_code.toLowerCase().includes(q) ||
          i.stage.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.product_type.toLowerCase().includes(q)
      );
    }

    // Stage filter
    if (stageFilter !== 'All') {
      items = items.filter((i) => i.stage === stageFilter);
    }

    // Category filter
    if (categoryFilter !== 'All') {
      items = items.filter((i) => i.category === categoryFilter);
    }

    // Status filter
    if (statusFilter === 'low') {
      items = items.filter((i) => i.low_stock_limit > 0 && i.stock > 0 && i.stock <= i.low_stock_limit);
    } else if (statusFilter === 'out') {
      items = items.filter((i) => i.stock <= 0);
    } else if (statusFilter === 'over') {
      items = items.filter((i) => i.high_stock_limit > 0 && i.stock >= i.high_stock_limit);
    } else if (statusFilter === 'in_stock') {
      items = items.filter((i) => i.stock > 0);
    }

    // Sorting
    items.sort((a, b) => {
      if (sortBy === 'value-desc') return b.total_amount - a.total_amount;
      if (sortBy === 'value-asc') return a.total_amount - b.total_amount;
      if (sortBy === 'stock-desc') return b.stock - a.stock;
      if (sortBy === 'stock-asc') return a.stock - b.stock;
      if (sortBy === 'name-asc') return a.product_name.localeCompare(b.product_name);
      if (sortBy === 'name-desc') return b.product_name.localeCompare(a.product_name);
      return 0;
    });

    return items;
  }, [enrichedItems, search, stageFilter, categoryFilter, statusFilter, sortBy]);

  const stages = ['All', 'Raw', 'Stage 1', 'Stage 2', 'Stage 3', 'Finished'];

  return (
    <Box sx={{ pb: 6 }}>
      {/* Page Title & Quick Controls */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 3, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 750, color: '#12262a' }}>
              Inventory
            </Typography>
            <Chip
              size="small"
              label={`${enrichedItems.length} Records`}
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
            Real-time stage stock levels, weighted average valuation, and batch health.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Tooltip title="Refresh Inventory">
            <span>
              <IconButton
                onClick={() => refetch()}
                disabled={isFetching}
                sx={{
                  bgcolor: '#ffffff',
                  border: '1px solid #dde5e3',
                  '&:hover': { bgcolor: '#f3f6f5' },
                }}
              >
                <RefreshRounded
                  fontSize="small"
                  sx={{
                    animation: isFetching ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>

          {/* View Mode Toggle */}
          <Paper
            variant="outlined"
            sx={{
              display: 'flex',
              p: 0.5,
              borderRadius: '10px',
              bgcolor: '#ffffff',
              borderColor: '#dde5e3',
            }}
          >
            <Tooltip title="Card View">
              <IconButton
                size="small"
                onClick={() => setViewMode('card')}
                sx={{
                  borderRadius: '8px',
                  bgcolor: viewMode === 'card' ? palette.teal : 'transparent',
                  color: viewMode === 'card' ? '#ffffff' : 'text.secondary',
                  '&:hover': {
                    bgcolor: viewMode === 'card' ? palette.teal : 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                <GridViewRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Table View">
              <IconButton
                size="small"
                onClick={() => setViewMode('table')}
                sx={{
                  borderRadius: '8px',
                  bgcolor: viewMode === 'table' ? palette.teal : 'transparent',
                  color: viewMode === 'table' ? '#ffffff' : 'text.secondary',
                  '&:hover': {
                    bgcolor: viewMode === 'table' ? palette.teal : 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                <TableRowsRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Date-Wise Production Records">
              <Button
                size="small"
                onClick={() => setViewMode('datewise')}
                startIcon={<CalendarMonthOutlined sx={{ fontSize: 16 }} />}
                sx={{
                  ml: 0.5,
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontSize: 12,
                  fontWeight: 650,
                  px: 1.2,
                  py: 0.4,
                  bgcolor: viewMode === 'datewise' ? palette.teal : 'transparent',
                  color: viewMode === 'datewise' ? '#ffffff' : 'text.secondary',
                  '&:hover': {
                    bgcolor: viewMode === 'datewise' ? palette.teal : 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                Date-Wise Records
              </Button>
            </Tooltip>
          </Paper>
        </Stack>
      </Stack>

      {/* KPI Stats Overview */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Total Inventory Value"
          value={fmtMoney(stats.totalValuation)}
          subtitle={`${fmtNum(stats.totalQty, 0)} units total in store`}
          icon={AccountBalanceWalletOutlined}
          iconBg="rgba(15, 118, 110, 0.1)"
          iconColor={palette.teal}
        />

        <StatCard
          label="Active Stages & Batches"
          value={fmtNum(enrichedItems.length, 0)}
          subtitle="Tracked stock locations"
          icon={Inventory2Outlined}
          iconBg="rgba(2, 132, 199, 0.1)"
          iconColor="#0284c7"
        />

        <StatCard
          label="Low Stock Alerts"
          value={fmtNum(stats.lowStockCount, 0)}
          alert={
            stats.lowStockCount > 0 ? (
              <Chip
                size="small"
                icon={<WarningAmberRounded sx={{ fontSize: '14px !important' }} />}
                label="Action needed"
                color="warning"
                sx={{ height: 22, fontSize: 11, fontWeight: 700, borderRadius: '6px' }}
              />
            ) : (
              <Chip
                size="small"
                icon={<CheckCircleOutlineRounded sx={{ fontSize: '14px !important' }} />}
                label="All safe"
                color="success"
                sx={{ height: 22, fontSize: 11, fontWeight: 700, borderRadius: '6px' }}
              />
            )
          }
          icon={WarningAmberRounded}
          iconBg="rgba(217, 119, 6, 0.1)"
          iconColor="#d97706"
        />

        <StatCard
          label="Products Represented"
          value={fmtNum(new Set(enrichedItems.map((i) => i.product)).size, 0)}
          subtitle={`Across ${stages.length - 1} manufacturing stages`}
          icon={CategoryOutlined}
          iconBg="rgba(99, 102, 241, 0.1)"
          iconColor="#6366f1"
        />
      </Box>

      {/* Warehouse Valuation Bifurcation by Charge Head */}
      {warehouseBifurcation && warehouseBifurcation.heads.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 2.25,
            mb: 3,
            borderRadius: '14px',
            bgcolor: '#ffffff',
            borderColor: '#dde5e3',
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 1.25, gap: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <PieChartOutlined sx={{ color: palette.teal, fontSize: 22 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 750, color: '#12262a' }}>
                Warehouse Valuation Bifurcation across Production Charges
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 800, color: palette.teal }}>
              Total Warehouse Valuation: {fmtMoney(stats.totalValuation, 2)}
            </Typography>
          </Box>

          {/* Proportional Stacked Bar */}
          <BifurcationStackedBar
            components={warehouseBifurcation.heads.map((h) => ({
              name: h.name,
              total: h.amount,
              percent: h.percent.toFixed(1),
              color: h.color,
            }))}
            height={10}
            sx={{ mb: 1.5 }}
          />

          {/* Charge Heads Legend & Amounts */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
              gap: 1.5,
            }}
          >
            {warehouseBifurcation.heads.map((h) => (
              <Box
                key={h.key}
                sx={{
                  p: 1.25,
                  borderRadius: '8px',
                  bgcolor: '#f8faf9',
                  border: '1px solid #e7eeec',
                  borderLeft: `4px solid ${h.color}`,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 11, display: 'block' }}>
                  {h.name}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#12262a', mt: 0.25 }}>
                  {fmtMoney(h.amount, 2)}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: h.color }}>
                  {h.percent.toFixed(1)}% of store
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Filter & Toolbar Area */}
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
        <Stack spacing={2}>
          {/* Top Row: Search + Status Dropdown + Category + Sort */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            {/* Search Input */}
            <TextField
              placeholder="Search by product name, code, stage, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{
                flex: { md: 1 },
                maxWidth: { md: 440 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#f8faf9',
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: search && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch('')}>
                        <CloseRounded fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            {/* Dropdown Filters */}
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {/* Category Dropdown (if categories exist) */}
              {categories.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    sx={{ borderRadius: '10px', bgcolor: '#f8faf9', fontSize: 13.5 }}
                  >
                    <MenuItem value="All">All Categories</MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.name} value={c.name}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Stock Status Dropdown */}
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  sx={{ borderRadius: '10px', bgcolor: '#f8faf9', fontSize: 13.5 }}
                >
                  <MenuItem value="All">All Statuses</MenuItem>
                  <MenuItem value="in_stock">In Stock ({'>'} 0)</MenuItem>
                  <MenuItem value="low">Low Stock Alert</MenuItem>
                  <MenuItem value="over">Overstocked</MenuItem>
                  <MenuItem value="out">Zero Stock</MenuItem>
                </Select>
              </FormControl>

              {/* Sort Selector */}
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  sx={{ borderRadius: '10px', bgcolor: '#f8faf9', fontSize: 13.5 }}
                >
                  <MenuItem value="value-desc">Value: High to Low</MenuItem>
                  <MenuItem value="value-asc">Value: Low to High</MenuItem>
                  <MenuItem value="stock-desc">Stock: High to Low</MenuItem>
                  <MenuItem value="stock-asc">Stock: Low to High</MenuItem>
                  <MenuItem value="name-asc">Name: A to Z</MenuItem>
                  <MenuItem value="name-desc">Name: Z to A</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>

          <Divider sx={{ borderColor: '#edf2f1' }} />

          {/* Stage Tabs Row */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              overflowX: 'auto',
              pb: 0.5,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {stages.map((stg) => {
              const active = stageFilter === stg;
              const count = stats.stageCounts[stg] || 0;
              const theme = getStageTheme(stg);

              return (
                <Chip
                  key={stg}
                  label={
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <span>{stg === 'All' ? 'All Stages' : (STAGE_THEMES[stg]?.label || stg)}</span>
                      <Box
                        component="span"
                        sx={{
                          px: 0.75,
                          py: 0.1,
                          fontSize: 11,
                          fontWeight: 700,
                          borderRadius: '10px',
                          bgcolor: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                          color: active ? '#ffffff' : 'text.primary',
                        }}
                      >
                        {count}
                      </Box>
                    </Stack>
                  }
                  onClick={() => setStageFilter(stg)}
                  sx={{
                    px: 0.5,
                    py: 1,
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    bgcolor: active ? palette.teal : '#f3f6f5',
                    color: active ? '#ffffff' : '#334155',
                    border: '1px solid',
                    borderColor: active ? palette.teal : '#dde5e3',
                    transition: 'all 0.18s ease',
                    '&:hover': {
                      bgcolor: active ? palette.teal : '#e6f0ee',
                    },
                  }}
                />
              );
            })}
          </Stack>
        </Stack>
      </Paper>

      {/* Main Content Area */}
      {isLoading ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rounded" height={180} sx={{ borderRadius: '12px' }} />
          ))}
        </Box>
      ) : displayItems.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: '14px',
            bgcolor: '#ffffff',
            borderColor: '#dde5e3',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: '#f1f5f9',
              color: '#64748b',
              display: 'grid',
              placeItems: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <WarehouseOutlined sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            No stock entries found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: 'auto', mb: 2.5 }}>
            {search || stageFilter !== 'All' || statusFilter !== 'All'
              ? 'No inventory records match your selected filters. Try clearing your search or filters.'
              : 'Inventory is updated automatically as Purchase bills and Stage Batches are completed.'}
          </Typography>
          {(search || stageFilter !== 'All' || statusFilter !== 'All' || categoryFilter !== 'All') && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setSearch('');
                setStageFilter('All');
                setStatusFilter('All');
                setCategoryFilter('All');
              }}
              sx={{ borderRadius: '8px' }}
            >
              Reset Filters
            </Button>
          )}
        </Paper>
      ) : viewMode === 'card' ? (
        /* Modern Card Grid View */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(3, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {displayItems.map((item) => (
            <InventoryCard key={item.name} item={item} onSelect={setSelectedItem} />
          ))}
        </Box>
      ) : viewMode === 'table' ? (
        /* Modern Table View (Alternate) */
        <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: '#ffffff' }}>
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Stock</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="right">Valuation</TableCell>
                  <TableCell align="center" sx={{ minWidth: 180 }}>Charge Split (Bifurcation)</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayItems.map((item) => {
                  const stageTheme = getStageTheme(item.stage);
                  const isLow = item.low_stock_limit > 0 && item.stock <= item.low_stock_limit;

                  return (
                    <TableRow key={item.name} hover onClick={() => setSelectedItem(item)} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#12262a' }}>
                          {item.product_name}
                        </Typography>
                        {toInternalStage(item.stage) === 'Finished' ? (
                          <Chip
                            size="small"
                            label={item.production_code ? `Prod Code: ${item.production_code}` : (item.product_code || item.product)}
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 750,
                              fontSize: 10.5,
                              bgcolor: '#ecfdf5',
                              color: '#065f46',
                              border: '1px solid #a7f3d0',
                              height: 20,
                              mt: 0.3,
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                            {item.product_code || item.product}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          label={stageTheme.label || item.stage}
                          sx={{
                            bgcolor: stageTheme.badgeBg,
                            color: stageTheme.badgeText,
                            fontWeight: 700,
                            fontSize: 11.5,
                            borderRadius: '6px',
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {item.product_type || '—'}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {fmtNum(item.stock, 2)}{' '}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {item.uom}
                          </Typography>
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {fmtMoney(item.unit_price, 2)}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 750, color: palette.teal }}>
                          {fmtMoney(item.total_amount, 2)}
                        </Typography>
                      </TableCell>

                      <TableCell align="center">
                        {item.bifurcation ? (
                          <Box sx={{ minWidth: 170, textAlign: 'left', py: 0.5 }}>
                            <BifurcationStackedBar components={item.bifurcation.components} height={6} sx={{ mb: 0.6 }} />
                            <ChargeBadges costHeads={item.bifurcation.cost_heads} compact />
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        {isLow ? (
                          <Chip size="small" color="warning" label="Low Stock" sx={{ fontWeight: 700, height: 22 }} />
                        ) : item.stock <= 0 ? (
                          <Chip size="small" label="Zero Stock" sx={{ height: 22 }} />
                        ) : (
                          <Chip size="small" color="success" variant="outlined" label="Optimal" sx={{ height: 22 }} />
                        )}
                      </TableCell>

                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(item);
                            }}
                            sx={{ fontSize: 12, fontWeight: 600, color: palette.teal }}
                          >
                            View
                          </Button>
                          {item.stage === 'Stage 3' && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={(e) => openMoveDialog(item, e)}
                              sx={{
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: '7px',
                                bgcolor: '#059669',
                                '&:hover': { bgcolor: '#047857' },
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Move to Finished
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        /* Date-Wise Production Records View */
        <Paper variant="outlined" sx={{ borderRadius: '14px', p: 2.5, bgcolor: '#ffffff' }}>
          {/* Filters Bar */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="From Date"
              type="date"
              size="small"
              value={datewiseFrom}
              onChange={(e) => setDatewiseFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: '100%', sm: 150 }, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              label="To Date"
              type="date"
              size="small"
              value={datewiseTo}
              onChange={(e) => setDatewiseTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: '100%', sm: 150 }, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              label="Product"
              size="small"
              value={datewiseProduct}
              onChange={(e) => setDatewiseProduct(e.target.value)}
              placeholder="Search product..."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              label="Production Code"
              size="small"
              value={datewiseProdCode}
              onChange={(e) => setDatewiseProdCode(e.target.value)}
              placeholder="Code..."
              sx={{ width: { xs: '100%', sm: 140 }, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              label="Batch Number"
              size="small"
              value={datewiseBatchNo}
              onChange={(e) => setDatewiseBatchNo(e.target.value)}
              placeholder="Batch no..."
              sx={{ width: { xs: '100%', sm: 140 }, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <Select
                value={datewiseStage}
                onChange={(e) => setDatewiseStage(e.target.value)}
                sx={{ borderRadius: '10px' }}
              >
                <MenuItem value="All">All Stages</MenuItem>
                <MenuItem value="Stage 1">Stage 1 (Insert Making)</MenuItem>
                <MenuItem value="Stage 2">Stage 2 (PU & Casting)</MenuItem>
                <MenuItem value="Stage 3">Stage 3 (CNC)</MenuItem>
              </Select>
            </FormControl>
            <IconButton onClick={() => refetchDatewise()} sx={{ borderRadius: '10px', border: '1px solid #dde5e3' }}>
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Stack>

          {/* Table */}
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f8faf9' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Production Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Batch No.</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Production Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Production Stage</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Produced Qty</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Available Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>UOM</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isDatewiseLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <LinearProgress />
                    </TableCell>
                  </TableRow>
                ) : datewiseRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No production records found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  datewiseRecords.map((r) => {
                    const isFinished = r.stage === 'Finished' || r.stage === 'Finished Goods' || r.stage_label === 'Finished Goods';
                    const isStage3 = (r.stage === 'Stage 3' || r.stage?.includes('3')) && !isFinished;
                    const effectiveAvail = isFinished ? Number(r.available_qty || r.produced_qty || 0) : getEffectiveAvailableQty(r);

                    return (
                      <TableRow key={(r.batch_no || '') + (r.stage || '')} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {fmtDDMMYYYY(r.production_date)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {isFinished && r.production_code ? `FG-${r.production_code}` : r.batch_no}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {isFinished ? (r.production_code || r.product_code || '-') : (r.product_code || '-')}
                        </TableCell>
                        <TableCell>
                          {r.production_code ? (
                            <Chip
                              size="small"
                              label={r.production_code}
                              sx={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#0f766e' }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.product_name || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={r.stage_label || r.stage}
                            sx={{
                              fontSize: 11,
                              fontWeight: 700,
                              bgcolor: getStageTheme(r.stage).badgeBg,
                              color: getStageTheme(r.stage).badgeText,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 650 }}>
                          {fmtNum(r.produced_qty, 2)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: effectiveAvail > 0 ? '#059669' : 'text.secondary' }}>
                          {fmtNum(effectiveAvail, 2)}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{r.uom || '-'}</TableCell>
                        <TableCell align="right">
                          {isStage3 ? (
                            effectiveAvail > 0 ? (
                              <Button
                                size="small"
                                variant="contained"
                                onClick={(e) => openMoveDialog(r, e)}
                                sx={{
                                  fontSize: 11,
                                  bgcolor: '#059669',
                                  '&:hover': { bgcolor: '#047857' },
                                  textTransform: 'none',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Move to Finished Goods
                              </Button>
                            ) : (
                              <Chip
                                size="small"
                                label="Finished"
                                sx={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  bgcolor: '#ecfdf5',
                                  color: '#059669',
                                  border: '1px solid #a7f3d0',
                                  height: 22,
                                }}
                              />
                            )
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Transfer to Finished Goods Dialog (Supports Partial or Full quantity) */}
      <Dialog
        open={!!moveTarget}
        onClose={() => !moveLoading && setMoveTarget(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 750, color: '#12262a', pb: 1 }}>
          Move to Finished Goods
        </DialogTitle>
        <DialogContent dividers>
          {moveTarget && (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Box sx={{ p: 2, bgcolor: '#f8faf9', borderRadius: '12px', border: '1px solid #e7eeec' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 750, color: '#12262a' }}>
                  {moveTarget.product_name || moveTarget.product}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                  Product Code: <strong>{moveTarget.product_code || moveTarget.product}</strong>
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                  {moveTarget.batch_no && (
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Production Batch:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        {moveTarget.batch_no}
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Total Produced:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {fmtNum(moveTarget.produced_qty, 2)} {moveTarget.uom || 'PCS'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Available in Stage 3:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#059669', fontSize: 15 }}>
                      {fmtNum(moveTarget.available_qty, 2)} {moveTarget.uom || 'PCS'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* Quantity Input with Quick Selectors */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155' }}>
                    Quantity to Transfer *
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setMoveQty(String(moveTarget.available_qty))}
                      sx={{ fontSize: 10.5, py: 0.1, px: 1, minWidth: 0, borderRadius: '6px' }}
                    >
                      All ({moveTarget.available_qty})
                    </Button>
                    {moveTarget.available_qty > 1 && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setMoveQty(String(Math.floor(moveTarget.available_qty / 2)))}
                        sx={{ fontSize: 10.5, py: 0.1, px: 1, minWidth: 0, borderRadius: '6px' }}
                      >
                        Half ({Math.floor(moveTarget.available_qty / 2)})
                      </Button>
                    )}
                  </Stack>
                </Stack>
                <TextField
                  type="number"
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                  fullWidth
                  size="small"
                  autoFocus
                  inputProps={{
                    min: 0.01,
                    max: Number(moveTarget.available_qty),
                    step: 0.01,
                  }}
                  helperText={
                    Number(moveQty) > 0 && Number(moveQty) <= Number(moveTarget.available_qty)
                      ? `Remaining in Stage 3: ${fmtNum(moveTarget.available_qty - Number(moveQty), 2)} ${moveTarget.uom || 'PCS'}`
                      : `Enter a quantity between 0.01 and ${moveTarget.available_qty}`
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </Box>

              {/* Production Code */}
              <TextField
                label="Production Code (Finished Goods)"
                value={moveProdCode}
                onChange={(e) => setMoveProdCode(e.target.value)}
                fullWidth
                size="small"
                placeholder="e.g. PC-001"
                helperText="Change or confirm production code for Finished Goods"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />

              {/* Destination Location */}
              <TextField
                label="Destination Location"
                value={moveLocation}
                onChange={(e) => setMoveLocation(e.target.value)}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />

              {/* Remarks */}
              <TextField
                label="Remarks (Optional)"
                value={moveRemarks}
                onChange={(e) => setMoveRemarks(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => setMoveTarget(null)}
            disabled={moveLoading}
            color="inherit"
            sx={{ borderRadius: '8px' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTransferConfirm}
            variant="contained"
            disabled={moveLoading || !moveQty || Number(moveQty) <= 0 || Number(moveQty) > Number(moveTarget?.available_qty)}
            sx={{ borderRadius: '8px', bgcolor: '#059669', '&:hover': { bgcolor: '#047857' }, px: 3, fontWeight: 700 }}
          >
            {moveLoading ? 'Transferring…' : `Confirm Move ${Number(moveQty) > 0 ? `${moveQty} PCS` : ''} to Finished`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detailed Inspection Dialog */}
      <DetailDialog
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenMoveDialog={openMoveDialog}
        getEffectiveAvailableQty={getEffectiveAvailableQty}
      />
    </Box>
  );
}