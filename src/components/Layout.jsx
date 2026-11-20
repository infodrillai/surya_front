import { LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getMenu } from '../config/menu';
import { useAuthStore } from '../stores/authStore';
import { useSyncStore } from '../stores/syncStore';
import { useUiStore } from '../stores/uiStore';
import { palette } from '../theme';
import SuryaBrandMark, { companyName } from './SuryaBrandMark';

const WIDTH = 252;

function Nav({ onNavigate, collapsed = false }) {
  const { hasRole, isAdmin, isSalesPerson, isStoreExecutive, isPuOperator, isBeltOperator, roles } = useAuthStore();
  const { pathname } = useLocation();
  const activeMenu = getMenu(isAdmin, isSalesPerson, roles);
  const isRestrictedRole = isStoreExecutive || isPuOperator || isBeltOperator;

  const item = (to, label, Icon) => (
    <ListItemButton
      key={to}
      component={NavLink}
      to={to}
      onClick={onNavigate}
      selected={pathname === to || pathname.startsWith(to + '/')}
      end
      aria-label={label}
      sx={{
        mx: collapsed ? 1 : 1.5,
        mb: 0.25,
        borderRadius: 2,
        minHeight: 42,
        justifyContent: collapsed ? 'center' : 'initial',
        px: collapsed ? 1 : 1.5,
        color: '#c6d4e6',
        gap: collapsed ? 0 : 1,
        '&.Mui-selected': { bgcolor: palette.teal, color: '#fff' },
        '&.Mui-selected:hover': { bgcolor: palette.teal },
        '&:hover': { bgcolor: palette.inkSoft },
      }}
    >
      <Tooltip title={collapsed ? label : ''} placement="right">
        <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 26, justifyContent: 'center' }}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </ListItemIcon>
      </Tooltip>
      {!collapsed && <ListItemText primary={label} slotProps={{ primary: { fontSize: 14 } }} />}
    </ListItemButton>
  );

  return (
    <Box component="nav" aria-label="ERP navigation" sx={{ height: '100%', bgcolor: palette.ink, color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: collapsed ? 1.5 : 2, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Tooltip title={collapsed ? companyName : ''} placement="right"><span><SuryaBrandMark /></span></Tooltip>
        {!collapsed && <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ lineHeight: 1.2, fontWeight: 750 }}>{companyName}</Typography>
          <Typography variant="caption" sx={{ color: '#9aadc2' }}>
          {isStoreExecutive
            ? 'Store Workspace'
            : isPuOperator
            ? 'PU Production'
            : isBeltOperator
            ? 'Belt Production'
            : isSalesPerson && !isAdmin
            ? 'Sales Workspace'
            : 'Production and Sales ERP'}
          </Typography>
        </Box>}
      </Box>
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          pb: 2,
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: '#516984 transparent',
        }}
      >
        {(!isSalesPerson && !isRestrictedRole) || isAdmin ? (
          <List dense disablePadding>{item('/', 'Dashboard', LayoutDashboard)}</List>
        ) : null}
        {activeMenu.map((g) => {
          const items = g.items.filter((i) => {
            if (isSalesPerson) return true;
            if (isRestrictedRole) return true;
            return hasRole(i.roles);
          });
          return items.length ? (
            <List
              key={g.section}
              dense
              subheader={
                <Typography variant="caption" sx={{ px: collapsed ? 0 : 3, pt: 2, pb: 0.5, display: 'block', color: '#8095ad', textAlign: collapsed ? 'center' : 'left' }}>
                  {collapsed ? g.section.slice(0, 1) : g.section}
                </Typography>
              }
            >
              {items.map((i) => item(i.path, i.label, i.icon))}
            </List>
          ) : null;
        })}
      </Box>
    </Box>
  );
}

export default function Layout({ children }) {
  const wide = useMediaQuery((t) => t.breakpoints.up('md'));
  const [collapsed, setCollapsed] = useState(false);
  const { mobileNav, setMobileNav } = useUiStore();
  const { fullName, user, logout, isAdmin, isSalesPerson, isStoreExecutive, isPuOperator, isBeltOperator, salesPerson } = useAuthStore();
  const sync = useSyncStore();
  const roleLabel = isAdmin
    ? 'Administrator'
    : isStoreExecutive
    ? 'Store Executive'
    : isPuOperator
    ? 'PU Operator'
    : isBeltOperator
    ? 'Belt Operator'
    : isSalesPerson
    ? `Sales Person${salesPerson?.employee_id ? ` · ${salesPerson.employee_id}` : ''}`
    : 'User';

  const drawerWidth = wide && collapsed ? 76 : WIDTH;
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={wide ? 'permanent' : 'temporary'}
        open={wide || mobileNav}
        onClose={() => setMobileNav(false)}
        sx={{
          width: wide ? drawerWidth : undefined,
          flexShrink: 0,
          transition: (theme) => theme.transitions.create('width'),
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '& .MuiDrawer-paper': {
            width: { xs: WIDTH, md: drawerWidth },
            border: 0,
            ...(wide && { transition: (theme) => theme.transitions.create('width') }),
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          },
        }}
      >
        <Nav collapsed={wide && collapsed} onNavigate={() => setMobileNav(false)} />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)' }}
        >
          <Toolbar sx={{ gap: { xs: 1, sm: 1.5 } }}>
            {!wide && (
              <IconButton edge="start" onClick={() => setMobileNav(true)} aria-label="Open menu">
                <Menu size={20} />
              </IconButton>
            )}
            {wide && (
              <Tooltip title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
                <IconButton onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} size="small">
                  {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </IconButton>
              </Tooltip>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={sync.error || 'Master data cache'}>
              <Chip
                size="small"
                icon={<RefreshCw size={14} />}
                variant="outlined"
                color={sync.status === 'error' ? 'error' : sync.status === 'ready' ? 'success' : 'default'}
                label={sync.status === 'ready' ? 'Up to date' : sync.status === 'error' ? 'Sync problem' : 'Syncing'}
              />
            </Tooltip>
            <Divider orientation="vertical" flexItem />
            <Avatar sx={{ width: 32, height: 32, bgcolor: palette.teal, fontSize: 14 }}>
              {(fullName || user || '?')[0]}
            </Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                {fullName || user}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {roleLabel}
              </Typography>
            </Box>
            <Tooltip title="Sign out">
              <IconButton onClick={logout} aria-label="Sign out">
                <LogOut size={19} />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ width: '100%', minWidth: 0, overflowX: 'hidden' }}>{children}</Box>
      </Box>
    </Box>
  );
}
