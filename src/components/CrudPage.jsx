import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, InputAdornment,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteDoc, getDoc, getList, runAction } from '../api/client';
import { db } from '../db/dexie';
import { reloadMasters } from '../db/masterCache';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import DocForm from './DocForm';

const STATUS_COLOR = { 'Pending Approval': 'warning', Approved: 'info', 'Partially Dispatched': 'warning', Completed: 'success', Accepted: 'success', Rejected: 'error', Disapproved: 'error', Superseded: 'default', Sent: 'info' };

const DISPATCH_STATUS_COLOR = {
  Draft: 'default',
  'Pending Confirmation': 'warning',
  Dispatched: 'success',
  Cancelled: 'error',
};

const RETURN_STATUS_COLOR = {
  Draft: 'default',
  Confirmed: 'success',
  Cancelled: 'error',
};

const PURCHASE_STATUS_COLOR = {
  Draft: 'default',
  Ordered: 'info',
  'Partially Received': 'warning',
  Received: 'success',
  Cancelled: 'error',
};

const RECEIPT_STATUS_COLOR = {
  Draft: 'default',
  Confirmed: 'success',
  Cancelled: 'error',
};

function Cell({ col, row, productMap }) {
  const v = col.getValue ? col.getValue(row) : row[col.field];
  if (col.field === 'product') {
    const val = productMap?.[v] || productMap?.[row.product] || row.product_name || v || '';
    return <span>{val}</span>;
  }
  if (col.type === 'doc-status')
    return <Chip size="small" color={row.is_completed ? 'success' : 'default'} label={row.is_completed ? 'Completed' : 'Draft'} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'status') return <Chip size="small" color={STATUS_COLOR[v] || 'default'} variant={v === 'Pending Approval' ? 'outlined' : 'filled'} label={v} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'dispatch-status') return <Chip size="small" color={DISPATCH_STATUS_COLOR[v] || 'default'} label={v || 'Draft'} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'return-status') return <Chip size="small" color={RETURN_STATUS_COLOR[v] || 'default'} label={v || 'Draft'} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'purchase-status') return <Chip size="small" color={PURCHASE_STATUS_COLOR[v] || (row.is_completed ? 'success' : 'default')} label={v || (row.is_completed ? 'Received' : 'Draft')} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'receipt-status') return <Chip size="small" color={RECEIPT_STATUS_COLOR[v] || 'default'} label={v || 'Draft'} sx={{ fontSize: '0.75rem', height: 24 }} />;
  if (col.type === 'image') {
    return (
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1,
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          bgcolor: '#f8fafc',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        {v ? (
          <Box
            component="img"
            src={v}
            alt={col.label || ''}
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>—</Typography>
        )}
      </Box>
    );
  }
  if (col.type === 'currency') return <span>{row.currency ? `${row.currency} ${fmtNum(v, col.dp ?? 2)}` : fmtMoney(v, col.dp ?? 2)}</span>;
  if (col.type === 'number') return <span>{fmtNum(v, col.dp ?? 3)}</span>;
  if (col.type === 'date') return <span>{fmtDate(v)}</span>;
  if (col.type === 'flag') return v ? <Chip size="small" color="warning" label="Below cost" sx={{ fontSize: '0.75rem', height: 24 }} /> : null;
  return <span>{v != null ? String(v) : ''}</span>;
}

/** List + add / edit / delete for one resource. Masters read from IndexedDB, transactions from the server. */
export default function CrudPage({ config, embedded = false }) {
  const qc = useQueryClient();
  const notify = useUiStore((s) => s.notify);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [editing, setEditing] = useState(null); // null | {} (new) | doc
  const [deleting, setDeleting] = useState(null);

  const cached = useLiveQuery(() => (config.master ? db.table(config.doctype).toArray() : []), [config.doctype]);
  const server = useQuery({ queryKey: ['list', config.doctype], queryFn: () => getList(config.doctype), enabled: !config.master });
  const productList = useLiveQuery(() => db.table('Product').toArray(), []);
  const productMap = useMemo(() => {
    const m = {};
    for (const p of productList ?? []) {
      if (p.name) m[p.name] = p.product_name || p.name;
      if (p.product_code) m[p.product_code] = p.product_name || p.name;
    }
    return m;
  }, [productList]);

  const listing = useMemo(
    () => (config.master ? [...(cached || [])].sort((a, b) => String(b.modified).localeCompare(String(a.modified))) : server.data) || [],
    [cached, config.master, server.data],
  );

  const rows = useMemo(() => {
    let all = listing;
    if (config.transformRows) all = config.transformRows(all);
    if (config.filterRows) all = all.filter(config.filterRows);
    const q = search.trim().toLowerCase();
    return q
      ? all.filter((r) =>
          config.columns.some((c) => {
            let val = c.getValue ? c.getValue(r) : r[c.field];
            if (c.field === 'product') val = productMap?.[val] || productMap?.[r.product] || r.product_name || val;
            return String(val ?? '').toLowerCase().includes(q);
          })
        )
      : all;
  }, [listing, search, config, productMap]);

  const refresh = async () => {
    await qc.invalidateQueries();
    const companionDoctypes = config.companion?.doctypes || (config.companion?.doctype ? [config.companion.doctype] : []);
    if (config.master) await reloadMasters([config.doctype, ...companionDoctypes]);
  };

  const remove = useMutation({
    mutationFn: async (name) => {
      const companionDoctypes = config.companion?.doctypes || (config.companion?.doctype ? [config.companion.doctype] : []);
      for (const doctype of companionDoctypes) {
        let exists = !!(await db.table(doctype).get(name));
        if (!exists) {
          try { exists = !!(await getDoc(doctype, name)); } catch (_) { exists = false; }
        }
        if (exists) await deleteDoc(doctype, name);
      }
      return deleteDoc(config.doctype, name);
    },
    onSuccess: async () => { await refresh(); notify('Deleted'); setDeleting(null); },
    onError: (e) => { notify(e.message, 'error'); setDeleting(null); },
  });
  const action = useMutation({
    mutationFn: ({ row, a }) => a.run(row),
    onSuccess: async (msg) => { await refresh(); notify(msg || 'Done'); },
    onError: (e) => notify(e.message, 'error'),
  });

  const openRow = async (row) => setEditing(config.master ? { ...row, ...(config.companion ? await config.companion.load(row) : {}) } : await getDoc(config.doctype, row.name));
  const isLocked = (r) => !!r.is_completed || !!config.isLocked?.(r);
  const totalPages = Math.ceil(rows.length / perPage);
  const safePage = rows.length === 0 ? 0 : Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = rows.slice(safePage * perPage, safePage * perPage + perPage);

  // ── surya:open-doc event ──────────────────────────────────────────────────
  // This is the ONLY way to programmatically open a doc in the dialog.
  // openQuotation() dispatches this event — it no longer touches window.location.hash,
  // which was causing every embedded CrudPage (BeltBatch tabs, Batch tabs) to try
  // getDoc with the wrong doctype and produce cascading 404/500 errors.
  useEffect(() => {
    const handleOpen = async (e) => {
      if (e.detail?.doctype === config.doctype && e.detail?.name) {
        try {
          const doc = await getDoc(config.doctype, e.detail.name);
          if (doc) {
            // Close first so DocForm's open→true useEffect re-fires with the new doc
            setEditing(null);
            setTimeout(() => setEditing(doc), 0);
          }
        } catch (err) {
          notify(`Could not open ${e.detail.name}: ${err?.message || err}`, 'error');
        }
      }
    };
    window.addEventListener('surya:open-doc', handleOpen);
    return () => window.removeEventListener('surya:open-doc', handleOpen);
  }, [config.doctype]);

  // ── URL ?open=<name> deep-link ────────────────────────────────────────────
  // Only uses React Router's searchParams (never window.location.hash directly).
  // This handles external deep-links like /quotation?open=QTN-00092.
  // openQuotation() no longer sets the hash, so this effect only fires on real
  // URL navigation — not on in-app prev/next clicks.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openName = searchParams.get('open');
    if (!openName) return;
    // Clear the param immediately so other CrudPage instances don't react to it
    setSearchParams({}, { replace: true });
    getDoc(config.doctype, openName)
      .then((doc) => {
        if (doc) {
          setEditing(null);
          setTimeout(() => setEditing(doc), 0);
        }
      })
      .catch(() => {});
  }, [searchParams, config.doctype]);

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, width: '100%', boxSizing: 'border-box' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          {!embedded && <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{config.plural || `${config.title}s`}</Typography>}
          {config.subtitle && !embedded && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{config.subtitle}</Typography>}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ minWidth: 0 }}>
          <TextField
            size="small"
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            sx={{
              width: { xs: '100%', sm: 220 },
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                bgcolor: 'background.paper',
                '& fieldset': {
                  top: 0,
                  borderRadius: '8px',
                  '& legend': { display: 'none' },
                },
              },
            }}
            slotProps={{ htmlInput: { 'aria-label': 'Search' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          {!config.readOnlyList && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setEditing(config.newDoc ? config.newDoc() : {})}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'stretch' } }}
            >
              Add {config.title}
            </Button>
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ overflow: 'hidden', boxShadow: '0 2px 8px rgb(20 36 58 / 4%)' }}>
        <TableContainer tabIndex={0} aria-label={config.plural || config.title} sx={{ '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
          <Table size="small" sx={{ width: '100%', '& .MuiTableCell-root': { py: 1, px: 1.5, fontSize: '0.88rem' } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                {config.columns.map((c) => (
                  <TableCell
                    key={c.field}
                    align={['currency', 'number'].includes(c.type) ? 'right' : 'left'}
                    sx={{ fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                  >
                    {c.label}
                  </TableCell>
                ))}
                {!config.readOnlyList && (
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', minWidth: 160 }}>
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => {
                const locked = isLocked(row);
                return (
                  <TableRow key={row.name} hover>
                    {config.columns.map((c) => (
                      <TableCell key={c.field} align={['currency', 'number'].includes(c.type) ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap' }}><Cell col={c} row={row} productMap={productMap} /></TableCell>
                    ))}
                    {!config.readOnlyList && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', py: 0.4 }}>
                        {(config.rowActions || []).filter((a) => a.show(row, isAdmin)).map((a) => (
                          <Button
                            key={a.key}
                            size="small"
                            variant={a.variant || 'text'}
                            sx={{
                              mr: 0.5,
                              py: 0.2,
                              px: 0.85,
                              fontSize: '0.78rem',
                              lineHeight: 1.3,
                              textTransform: 'none',
                              minWidth: 'unset',
                              ...(a.sx || {}),
                            }}
                            disabled={action.isPending}
                            onClick={() => action.mutate({ row, a })}
                          >
                            {a.label}
                          </Button>
                        ))}
                        <Tooltip title={locked ? 'View' : 'Edit'}>
                          <IconButton size="small" sx={{ p: 0.35 }} onClick={() => openRow(row)} aria-label={locked ? 'View' : 'Edit'}>
                            {locked ? <VisibilityIcon sx={{ fontSize: 20 }} /> : <EditIcon sx={{ fontSize: 20 }} />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={locked ? 'Locked' : 'Delete'}>
                          <span>
                            <IconButton size="small" sx={{ p: 0.35 }} color="error" disabled={locked} onClick={() => setDeleting(row)} aria-label="Delete">
                              <DeleteIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={config.columns.length + (config.readOnlyList ? 0 : 1)} sx={{ py: 6, textAlign: 'center' }}>
                    {(!config.master && server.isLoading) || (config.master && cached === undefined) ? (
                      <CircularProgress size={22} aria-label="Loading records" />
                    ) : server.isError && !server.data ? (
                      <Typography color="error" role="alert">Could not load records.</Typography>
                    ) : (
                      <Typography color="text.secondary">{search ? 'Nothing matches your search.' : config.readOnlyList ? 'Nothing here yet.' : `No ${config.plural?.toLowerCase() || config.title.toLowerCase() + 's'} yet. Use "Add ${config.title}" to create the first one.`}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={rows.length}
          page={safePage}
          rowsPerPage={perPage}
          rowsPerPageOptions={[10, 25, 50]}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPerPage(+e.target.value); setPage(0); }}
          sx={{ '& .MuiTablePagination-toolbar': { minHeight: 38, py: 0.25 } }}
        />
      </Paper>

      {editing && <DocForm config={config} doc={editing.name ? editing : null} open onClose={() => setEditing(null)} />}

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete {config.title}?</DialogTitle>
        <DialogContent><DialogContentText>"{deleting?.name}" will be permanently removed. This cannot be undone.</DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate(deleting.name)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
