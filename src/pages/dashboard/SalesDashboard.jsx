import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  PeopleAltOutlined as PeopleIcon,
  RequestQuoteOutlined as QuoteIcon,
  ReceiptLongOutlined as OrderIcon,
  AttachMoneyOutlined as MoneyIcon,
  HourglassEmptyOutlined as PendingIcon,
  CheckCircleOutlineRounded as CheckIcon,
  TrendingUpOutlined as TrendingIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { call } from '../../api/client';
import { fmtMoney, fmtNum } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { palette } from '../../theme';

function StatCard({ label, value, note, icon: Icon, color = palette.teal }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: '12px',
        bgcolor: '#ffffff',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 16px -4px rgba(0,0,0,0.06)' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 650, textTransform: 'uppercase', fontSize: 11 }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 750, color: '#0f172a' }}>
          {value}
        </Typography>
        {note && (
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
            {note}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '10px',
          bgcolor: `${color}15`,
          color: color,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon fontSize="small" />
      </Box>
    </Paper>
  );
}

export default function SalesDashboard() {
  const { fullName, salesPerson } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['sales_person_dashboard'],
    queryFn: () => call('clssurya.api.get_sales_person_dashboard'),
    refetchInterval: 30000,
  });

  const d = data || {};

  return (
    <Stack spacing={3.5}>
      {/* Welcome Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
            Welcome back, {salesPerson?.sales_person_name || fullName}!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Here is your live sales performance and customer order pipeline.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            component={NavLink}
            to="/quotation"
            variant="contained"
            startIcon={<QuoteIcon />}
            sx={{ bgcolor: palette.teal, '&:hover': { bgcolor: palette.inkSoft }, borderRadius: '8px', textTransform: 'none', fontWeight: 650 }}
          >
            New Quotation
          </Button>
          <Button
            component={NavLink}
            to="/customer"
            variant="outlined"
            startIcon={<PeopleIcon />}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 650 }}
          >
            My Customers
          </Button>
        </Stack>
      </Box>

      {/* KPI Cards Grid */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
        <StatCard
          label="Total Customers"
          value={fmtNum(d.total_customers || 0, 0)}
          icon={PeopleIcon}
          color="#0284c7"
          note="Assigned to your account"
        />
        <StatCard
          label="Total Quotations"
          value={fmtNum(d.total_quotations || 0, 0)}
          icon={QuoteIcon}
          color="#8b5cf6"
          note={`${d.accepted_quotations || 0} accepted / approved`}
        />
        <StatCard
          label="Pending Quotations"
          value={fmtNum(d.pending_quotations || 0, 0)}
          icon={PendingIcon}
          color="#f59e0b"
          note="Awaiting review or order"
        />
        <StatCard
          label="Monthly Sales"
          value={fmtMoney(d.monthly_sales_amount || 0)}
          icon={MoneyIcon}
          color="#10b981"
          note="Confirmed sales this month"
        />
        <StatCard
          label="Total Sales Orders"
          value={fmtNum(d.total_sales_orders || 0, 0)}
          icon={OrderIcon}
          color="#0f766e"
          note="Total orders received"
        />
        <StatCard
          label="Pending Orders"
          value={fmtNum(d.pending_orders || 0, 0)}
          icon={PendingIcon}
          color="#d97706"
          note="Awaiting admin approval"
        />
        <StatCard
          label="Completed Orders"
          value={fmtNum(d.completed_orders || 0, 0)}
          icon={CheckIcon}
          color="#059669"
          note="Delivered & confirmed"
        />
        <StatCard
          label="Approval Queue"
          value={fmtNum((d.pending_approvals || []).length, 0)}
          icon={TrendingIcon}
          color="#6366f1"
          note="Items pending admin signoff"
        />
      </Box>

      {/* Monthly Sales Performance Visual */}
      {d.monthly_chart && d.monthly_chart.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: '14px', bgcolor: '#ffffff' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 750, mb: 0.5, color: '#0f172a' }}>
            Monthly Sales & Quotations Trend (Last 6 Months)
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
            Comparison of total value quoted vs. confirmed sales orders.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${d.monthly_chart.length}, 1fr)`, gap: 2, alignItems: 'flex-end', height: 180, pt: 2, pb: 1 }}>
            {d.monthly_chart.map((m, idx) => {
              const maxVal = Math.max(...d.monthly_chart.map((c) => Math.max(c.quotations_amount || 0, c.orders_amount || 0)), 1);
              const qHeight = Math.max(8, ((m.quotations_amount || 0) / maxVal) * 120);
              const oHeight = Math.max(8, ((m.orders_amount || 0) / maxVal) * 120);

              return (
                <Box key={idx} sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                    <Box
                      title={`Quoted: ${fmtMoney(m.quotations_amount)}`}
                      sx={{ width: 14, height: `${qHeight}px`, bgcolor: '#cbd5e1', borderRadius: '4px 4px 0 0', transition: 'all 0.3s' }}
                    />
                    <Box
                      title={`Ordered: ${fmtMoney(m.orders_amount)}`}
                      sx={{ width: 14, height: `${oHeight}px`, bgcolor: palette.teal, borderRadius: '4px 4px 0 0', transition: 'all 0.3s' }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ mt: 1, fontWeight: 650, fontSize: 11, color: '#64748b' }}>
                    {m.month}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 10, color: palette.teal, fontWeight: 700 }}>
                    {fmtMoney(m.orders_amount, 0)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Stack direction="row" spacing={3} sx={{ mt: 2, justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, bgcolor: '#cbd5e1', borderRadius: '3px' }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Quoted Amount</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, bgcolor: palette.teal, borderRadius: '3px' }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Confirmed Orders</Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Two Column Section: Recent Quotations & Recent Orders */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        {/* Recent Quotations Table */}
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '14px', bgcolor: '#ffffff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#0f172a' }}>
              Recent Quotations
            </Typography>
            <Button component={NavLink} to="/quotation" size="small" endIcon={<OpenIcon fontSize="small" />} sx={{ fontSize: 12, textTransform: 'none' }}>
              View All
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Quote #</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Customer</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Amount</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11.5 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}><CircularProgress size={20} /></TableCell></TableRow>
                ) : !d.recent_quotations?.length ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No quotations yet.</TableCell></TableRow>
                ) : (
                  d.recent_quotations.map((q) => (
                    <TableRow key={q.name} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{q.name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{q.customer}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>{fmtMoney(q.grand_total)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={q.status || 'Draft'}
                          color={q.status === 'Accepted' || q.status === 'Approved' ? 'success' : q.status === 'Rejected' ? 'error' : 'default'}
                          sx={{ fontSize: 10.5, height: 20, fontWeight: 700 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Recent Sales Orders Table */}
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '14px', bgcolor: '#ffffff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#0f172a' }}>
              Recent Sales Orders
            </Typography>
            <Button component={NavLink} to="/sales-order" size="small" endIcon={<OpenIcon fontSize="small" />} sx={{ fontSize: 12, textTransform: 'none' }}>
              View All
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Order #</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Customer</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Amount</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11.5 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}><CircularProgress size={20} /></TableCell></TableRow>
                ) : !d.recent_orders?.length ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No sales orders yet.</TableCell></TableRow>
                ) : (
                  d.recent_orders.map((o) => (
                    <TableRow key={o.name} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{o.name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{o.customer}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>{fmtMoney(o.grand_total)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={o.status || 'Draft'}
                          color={o.status === 'Completed' || o.status === 'Approved' ? 'success' : o.status === 'Cancelled' ? 'error' : 'default'}
                          sx={{ fontSize: 10.5, height: 20, fontWeight: 700 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Pending Approval List */}
      {d.pending_approvals && d.pending_approvals.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '14px', bgcolor: '#ffffff' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#0f172a', mb: 0.5 }}>
            Pending Administrator Approvals
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Your submitted quotations and sales orders currently in the approval queue.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Doc Type</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Reference #</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11.5 }}>Customer</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11.5 }}>Amount</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11.5 }}>Current Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.pending_approvals.map((pa, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell sx={{ fontSize: 12, fontWeight: 650 }}>{pa.type}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 650, fontSize: 12 }}>{pa.name}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{pa.customer}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>{fmtMoney(pa.amount)}</TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={pa.status} color="warning" sx={{ fontSize: 10.5, height: 20, fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}

