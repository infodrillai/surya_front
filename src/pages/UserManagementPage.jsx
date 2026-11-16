import React, { useState } from 'react';
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
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
  Add as AddIcon,
  Key as KeyIcon,
  ManageAccounts as UserManageIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { call } from '../api/client';
import { palette } from '../theme';

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [dialogError, setDialogError] = useState(null);

  // Form state for creating user
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    role: 'Sales Person',
    employee_id: '',
    mobile_no: '',
    address: '',
  });

  const { data: users = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['user_management_list'],
    queryFn: () => call('clssurya.api.get_user_management_list'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ user, enabled }) => call('clssurya.api.update_user_status', { user, enabled }),
    onSuccess: (res) => {
      setMessage({ type: 'success', text: res.message || 'Status updated' });
      queryClient.invalidateQueries({ queryKey: ['user_management_list'] });
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Failed to update status' });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ user, new_password }) => call('clssurya.api.reset_user_password', { user, new_password }),
    onSuccess: (res) => {
      setMessage({ type: 'success', text: res.message || 'Password reset successfully' });
      setPwdOpen(false);
      setNewPassword('');
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Failed to reset password' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (user) => call('clssurya.api.delete_user_and_sales_person', { user }),
    onSuccess: (res) => {
      setMessage({ type: 'success', text: res.message || 'User and records deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['user_management_list'] });
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Failed to delete user' });
    },
  });

  const handleDelete = (user) => {
    if (user.name === 'Administrator' || user.name === 'surya@gmail.com') {
      setMessage({ type: 'error', text: 'Cannot delete primary Administrator accounts' });
      return;
    }
    if (window.confirm(`Are you sure you want to permanently delete user ${user.name}? This will also remove any linked Sales Person record.`)) {
      deleteUserMutation.mutate(user.name);
    }
  };

  const createUserMutation = useMutation({
    mutationFn: (data) => call('clssurya.api.create_user_and_sales_person', data),
    onSuccess: (res) => {
      setMessage({ type: 'success', text: res.message || 'User created successfully' });
      setDialogError(null);
      setCreateOpen(false);
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        role: 'Sales Person',
        employee_id: '',
        mobile_no: '',
        address: '',
      });
      queryClient.invalidateQueries({ queryKey: ['user_management_list'] });
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to create user';
      setDialogError(msg);
      setMessage({ type: 'error', text: msg });
    },
  });

  const handleToggle = (user, currentVal) => {
    toggleStatusMutation.mutate({ user: user.name, enabled: currentVal ? 0 : 1 });
  };

  const handleOpenReset = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setPwdOpen(true);
  };

  const handleResetSubmit = (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    resetPasswordMutation.mutate({ user: selectedUser.name, new_password: newPassword });
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <UserManageIcon sx={{ fontSize: 28, color: palette.teal }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#12262a' }}>
              User Management
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage ERP users, assign roles (Administrator / Sales Person), and control account status.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => refetch()} disabled={isFetching} sx={{ border: '1px solid #dde5e3' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: palette.teal, '&:hover': { bgcolor: '#0b5b50' }, borderRadius: 2 }}
          >
            Create User
          </Button>
        </Stack>
      </Stack>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8faf9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>User / Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Sales Person Profile</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isAdmin = u.is_admin;
                const isSales = u.is_sales_person;
                return (
                  <TableRow key={u.name} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#12262a' }}>
                            {u.full_name || u.first_name || u.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {u.name}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{u.email}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Chip
                          icon={<ShieldIcon sx={{ fontSize: 14 }} />}
                          label="Administrator"
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                      ) : isSales ? (
                        <Chip
                          label="Sales Person"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      ) : (
                        <Chip label="User" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {u.sales_person_name ? (
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {u.sales_person_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {u.employee_id || 'Linked'} {u.mobile_no ? `· ${u.mobile_no}` : ''}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          None
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Switch
                          checked={Boolean(u.enabled)}
                          onChange={() => handleToggle(u, u.enabled)}
                          disabled={u.name === 'Administrator'}
                          size="small"
                          color="success"
                        />
                        <Chip
                          label={u.enabled ? 'Active' : 'Inactive'}
                          size="small"
                          color={u.enabled ? 'success' : 'default'}
                          sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
                        />
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                        <Button
                          size="small"
                          startIcon={<KeyIcon fontSize="small" />}
                          onClick={() => handleOpenReset(u)}
                          sx={{ fontSize: 12, textTransform: 'none' }}
                        >
                          Reset
                        </Button>
                        {u.name !== 'Administrator' && u.name !== 'surya@gmail.com' && (
                          <Tooltip title="Delete User">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(u)}
                              disabled={deleteUserMutation.isPending}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog: Create User */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Create New User</DialogTitle>
          <DialogContent>
            {dialogError && (
              <Alert severity="error" onClose={() => setDialogError(null)} sx={{ mb: 2 }}>
                {dialogError}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Create a Frappe user and securely assign Administrator or Sales Person role.
            </Typography>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="First Name"
                  required
                  fullWidth
                  size="small"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
                <TextField
                  label="Last Name"
                  fullWidth
                  size="small"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </Stack>

              <TextField
                label="Email Address (Login ID)"
                type="email"
                required
                fullWidth
                size="small"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />

              <TextField
                label="Password"
                type="password"
                required
                fullWidth
                size="small"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                helperText="Must be at least 6 characters"
              />

              <FormControl fullWidth size="small">
                <InputLabel>Role Assignment</InputLabel>
                <Select
                  value={formData.role}
                  label="Role Assignment"
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <MenuItem value="Sales Person">Sales Person</MenuItem>
                  <MenuItem value="Administrator">Administrator</MenuItem>
                </Select>
              </FormControl>

              {formData.role === 'Sales Person' && (
                <>
                  <Divider sx={{ my: 1 }}>Sales Person Master Info</Divider>
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="Employee ID"
                      fullWidth
                      size="small"
                      placeholder="e.g. EMP-101"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    />
                    <TextField
                      label="Mobile Number"
                      fullWidth
                      size="small"
                      value={formData.mobile_no}
                      onChange={(e) => setFormData({ ...formData, mobile_no: e.target.value })}
                    />
                  </Stack>
                  <TextField
                    label="Address / Region"
                    fullWidth
                    size="small"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setCreateOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createUserMutation.isPending}
              sx={{ bgcolor: palette.teal, '&:hover': { bgcolor: '#0b5b50' } }}
            >
              {createUserMutation.isPending ? 'Creating…' : 'Create User'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog: Reset Password */}
      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleResetSubmit}>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Reset Password</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Reset password for <strong>{selectedUser?.name}</strong>.
            </Typography>
            <TextField
              label="New Password"
              type="password"
              required
              fullWidth
              size="small"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="Minimum 6 characters"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPwdOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={resetPasswordMutation.isPending}
              sx={{ bgcolor: palette.teal, '&:hover': { bgcolor: '#0b5b50' } }}
            >
              {resetPasswordMutation.isPending ? 'Updating…' : 'Update Password'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}

