import React from 'react';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  BadgeOutlined as BadgeIcon,
  EmailOutlined as EmailIcon,
  PhoneOutlined as PhoneIcon,
  LocationOnOutlined as LocationIcon,
  CalendarMonthOutlined as CalendarIcon,
  ShieldOutlined as ShieldIcon,
  PersonOutline as PersonIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { palette } from '../theme';

export default function MyProfilePage() {
  const { user, fullName, roles, isAdmin, isSalesPerson, salesPerson } = useAuthStore();

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto', pb: 6 }}>
      {/* Header Profile Card */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          bgcolor: '#ffffff',
          boxShadow: '0 4px 20px -4px rgba(18, 38, 42, 0.05)',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
          <Avatar
            sx={{
              width: 72,
              height: 72,
              bgcolor: palette.teal,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {(fullName || user || 'U')[0].toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#12262a' }}>
                {salesPerson?.sales_person_name || fullName || user}
              </Typography>
              {isAdmin ? (
                <Chip
                  icon={<ShieldIcon sx={{ fontSize: 14 }} />}
                  label="Administrator"
                  size="small"
                  color="error"
                  sx={{ fontWeight: 700 }}
                />
              ) : isSalesPerson ? (
                <Chip
                  label="Sales Person"
                  size="small"
                  color="primary"
                  sx={{ fontWeight: 700 }}
                />
              ) : (
                <Chip label="User" size="small" />
              )}
              {salesPerson?.status && (
                <Chip
                  label={salesPerson.status}
                  size="small"
                  color={salesPerson.status === 'Active' ? 'success' : 'default'}
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              User ID: <strong>{user}</strong>
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Details Grid */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 750, mb: 2, color: '#12262a' }}>
              Account & Role Information
            </Typography>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <EmailIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Email Address</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{user}</Typography>
                </Box>
              </Stack>
              <Divider />
              <Stack direction="row" spacing={1.5} alignItems="center">
                <ShieldIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Assigned Roles</Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.5, mt: 0.5 }}>
                    {roles.map((r) => (
                      <Chip key={r} label={r} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 750, mb: 2, color: '#12262a' }}>
              Sales Person Details
            </Typography>
            {salesPerson ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <BadgeIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Employee ID</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {salesPerson.employee_id || 'N/A'}
                    </Typography>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <PhoneIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Mobile Number</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {salesPerson.mobile_no || 'Not provided'}
                    </Typography>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CalendarIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Joining Date</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {salesPerson.joining_date || 'N/A'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            ) : (
              <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">
                  No dedicated Sales Person record is linked to this account.
                </Typography>
                <Typography variant="caption">
                  {isAdmin ? 'You have full Administrator access.' : 'Contact Administrator to link an employee record.'}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

