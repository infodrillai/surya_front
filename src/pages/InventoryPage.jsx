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
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { getList, call } from '../api/client';
import { db } from '../db/dexie';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { palette } from '../theme';

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
    label: 'Stage 1 Batch',
    Icon: PrecisionManufacturingOutlined,
    description: 'Semi-finished stock processed through Stage 1.',
  },
  'Stage 2': {
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    badgeBg: '#ede9fe',
    badgeText: '#6d28d9',
    label: 'Stage 2 Batch',
    Icon: TuneOutlined,
    description: 'Intermediary semi-finished stock ready for final stage.',
  },
  'Stage 3': {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    badgeBg: '#fef3c7',
    badgeText: '#b45309',
    label: 'Stage 3 Batch',
    Icon: ElectricBoltOutlined,
    description: 'Treated and charged batch heading to finished inventory.',
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
            label={item.stage}
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
                label="Zero"
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
function DetailDialog({ item, open, onClose }) {
  if (!item) return null;
  const stageTheme = getStageTheme(item.stage);
  const StageIcon = stageTheme.Icon;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 36,
                height: 36,
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
              <Typography variant="caption" color="text.secondary">
                {item.product_code || item.product} · {item.stage}
              </Typography>
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
                        {fmtMoney(head.unit_rate, 2)}/pc · {head.percent}%
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
                  {item.product_type || '—'}
                </Typography>
              </Box>

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
                  {item.uom || '—'}
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

      <DialogActions sx={{ p: 2 }}>
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
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'table'
  const [selectedItem, setSelectedItem] = useState(null);

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

  // Masters from IndexedDB (Dexie)
  const products = useLiveQuery(() => db.Product.toArray(), []) || [];
  const categories = useLiveQuery(() => db.Category.toArray(), []) || [];

  // Map product master by name/code for quick enrichment
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      map.set(p.name, p);
      if (p.product_code) map.set(p.product_code, p);
    });
    return map;
  }, [products]);

  // Enriched inventory items
  const enrichedItems = useMemo(() => {
    return serverInventory.map((item) => {
      const p = productMap.get(item.product);
      const bifKey = `${item.product}_${item.stage}`;
      const bif = serverBifurcation[bifKey] || null;
      return {
        ...item,
        product_name: p?.product_name || item.product,
        product_code: p?.product_code || item.product,
        product_type: p?.product_type || '',
        uom: p?.uom || '',
        category: p?.category || '',
        low_stock_limit: Number(p?.low_stock_limit) || 0,
        high_stock_limit: Number(p?.high_stock_limit) || 0,
        stock: Number(item.stock) || 0,
        unit_price: Number(item.unit_price) || 0,
        total_amount: Number(item.total_amount) || 0,
        bifurcation: bif,
      };
    });
  }, [serverInventory, productMap, serverBifurcation]);

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
                      <span>{stg === 'All' ? 'All Stages' : stg}</span>
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
      ) : (
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
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                          {item.product_code || item.product}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          label={item.stage}
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Detailed Inspection Dialog */}
      <DetailDialog item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} />
    </Box>
  );
}
