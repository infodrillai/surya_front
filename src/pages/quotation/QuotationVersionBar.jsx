import React from 'react';
import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PostAddIcon from '@mui/icons-material/PostAdd';
import { useQueryClient } from '@tanstack/react-query';
import { getList, runAction } from '../../api/client';

/**
 * Opens a quotation by dispatching surya:open-doc.
 * Does NOT touch window.location.hash — changing the hash causes every embedded
 * CrudPage (BeltBatchPage tabs, BatchPage tabs) to read the ?open= param and
 * fire getDoc with the wrong doctype, producing cascading 404/500 errors.
 */
export const openQuotation = (name) => {
  if (!name) return;
  window.dispatchEvent(new CustomEvent('surya:open-doc', { detail: { doctype: 'Quotation', name } }));
};

const formatDMY = (val) => {
  if (!val) return 'Calculated when saved';
  const parts = String(val).split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return val;
};

export default function QuotationVersionBar({ doc, values }) {
  const qc = useQueryClient();
  const name = doc?.name;
  const [allList, setAllList] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  // Fetch or retrieve quotation list.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let list = qc.getQueryData(['list', 'Quotation']);
        if (!Array.isArray(list) || list.length === 0) {
          try {
            list = await getList('Quotation', { limit: 1000 });
          } catch (_) {
            list = await getList('Quotation', {
              fields: ['name', 'creation', 'modified', 'status'],
              limit: 1000,
            }).catch(() => []);
          }
        }
        if (!alive) return;

        let items = Array.isArray(list) ? [...list] : [];
        if (doc?.name && !items.some((q) => q.name === doc.name)) {
          items.push({
            name: doc.name,
            version: doc?.version,
            status: doc?.status,
            previous_version: doc?.previous_version,
            parent_quotation: doc?.parent_quotation,
            creation: doc?.creation,
            modified: doc?.modified,
          });
        }

        if (items.length > 0) {
          const sorted = [...items].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          );
          setAllList(sorted);
        } else if (doc?.name) {
          setAllList([{ name: doc.name, version: doc?.version, status: doc?.status }]);
        }
      } catch (_) {
        if (alive && doc?.name) {
          setAllList([{ name: doc.name, version: doc?.version, status: doc?.status }]);
        }
      }
    })();
    return () => { alive = false; };
  }, [name, doc?.version, doc?.modified, qc]);

  // Build the full version family by walking the chain from the root
  const family = React.useMemo(() => {
    if (!name || !allList.length) return [];
    const findRoot = (docName, visited = new Set()) => {
      if (visited.has(docName)) return docName;
      visited.add(docName);
      const entry = allList.find((q) => q.name === docName);
      if (!entry) return docName;
      const parent = entry.previous_version || entry.parent_quotation;
      if (parent && parent !== docName) return findRoot(parent, visited);
      return docName;
    };
    const docParent = doc?.previous_version || doc?.parent_quotation;
    const root = (docParent && docParent !== name) ? findRoot(docParent) : findRoot(name);
    const chain = new Set();
    const addChain = (n) => {
      if (!n || chain.has(n)) return;
      chain.add(n);
      allList
        .filter((q) => q.name !== n && (q.previous_version === n || q.parent_quotation === n))
        .forEach((q) => addChain(q.name));
    };
    addChain(root);
    const inChain = allList.filter((q) => chain.has(q.name));
    return inChain.sort((a, b) => {
      if (a.version != null && b.version != null && a.version !== b.version) {
        return Number(a.version) - Number(b.version);
      }
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, [allList, name, doc]);

  // Direct revision of this doc (the quotation that superseded it)
  const revisionNext = allList.find(
    (q) => q.name !== name && (q.previous_version === name || q.parent_quotation === name)
  )?.name || null;

  const supersededBy = (doc?.superseded_by && doc.superseded_by !== name) ? doc.superseded_by : null;

  // Name-order neighbours in the full quotations list
  const idx = name ? allList.findIndex((q) => q.name === name) : -1;
  const listPrev = idx > 0 ? allList[idx - 1]?.name : null;
  const listNext = idx >= 0 && idx < allList.length - 1 ? allList[idx + 1]?.name : null;

  // Version family neighbours if this doc belongs to a multi-version family
  const famIdx = family.length > 1 ? family.findIndex((q) => q.name === name) : -1;
  const familyPrev = famIdx > 0 ? family[famIdx - 1]?.name : null;
  const familyNext = (famIdx >= 0 && famIdx < family.length - 1) ? family[famIdx + 1]?.name : null;

  let prevQuotation = familyPrev;
  if (!prevQuotation && doc?.previous_version && doc.previous_version !== name) {
    prevQuotation = doc.previous_version;
  }
  if (!prevQuotation && doc?.parent_quotation && doc.parent_quotation !== name) {
    prevQuotation = doc.parent_quotation;
  }
  if (!prevQuotation) {
    prevQuotation = listPrev;
  }
  if (prevQuotation === name) prevQuotation = null;

  let nextQuotation = familyNext || (revisionNext && revisionNext !== name ? revisionNext : null) || (supersededBy && supersededBy !== name ? supersededBy : null) || listNext;
  if (nextQuotation === name) nextQuotation = null;

  const isSuperseded = doc?.status === 'Superseded';
  const status = doc?.status;
  const canRevise = name && !familyNext && !revisionNext && !supersededBy && !['Superseded', 'Accepted'].includes(status);

  // Check expiration
  const expired = React.useMemo(() => {
    if (!doc) return false;
    if (['Accepted', 'Superseded'].includes(doc.status)) return false;
    if (doc.status === 'Disapproved') return true;
    let validUntil = doc.valid_until || values?.valid_until;
    if (!validUntil && doc.quotation_date) {
      const days = Number(doc.validity_days) > 0 ? Number(doc.validity_days) : 15;
      const d = new Date(doc.quotation_date);
      d.setDate(d.getDate() + days);
      validUntil = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    }
    if (!validUntil) return false;
    const today = new Date().toISOString().split('T')[0];
    return String(validUntil) < today;
  }, [doc, values]);

  const revise = async () => {
    if (!window.confirm(`Create a new version from ${name}? The original version will remain read-only.`)) return;
    setBusy(true);
    setError('');
    try {
      const resp = await runAction('Quotation', name, 'revise');
      if (resp?.result) openQuotation(resp.result);
    } catch (e) {
      setError(e?.message || 'Could not revise this quotation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Stack
        direction="row"
        spacing={1.5}
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        useFlexGap
      >
        {/* Left: Version badge + Revise button + Metadata */}
        <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          {name && (
            <Chip
              size="small"
              color="info"
              variant="outlined"
              label={`Version ${doc?.version || 1}`}
              sx={{ fontWeight: 700, borderRadius: '6px', height: 26, fontSize: '0.75rem', bgcolor: '#f0f9ff' }}
            />
          )}

          {canRevise && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PostAddIcon sx={{ fontSize: 16 }} />}
              disabled={busy}
              onClick={revise}
              sx={{
                bgcolor: '#0f766e',
                '&:hover': { bgcolor: '#115e59' },
                textTransform: 'none',
                borderRadius: '7px',
                fontWeight: 600,
                height: 28,
                fontSize: '0.78rem',
                boxShadow: 'none',
              }}
            >
              Revise Quotation
            </Button>
          )}

          <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#e2e8f0', display: { xs: 'none', sm: 'block' } }} />

          {/* Key Metadata */}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Created by:</span> {doc?.created_by_name || doc?.owner || 'Current user'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
              ·
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Currency:</span> {values?.currency || doc?.currency || 'INR'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
              ·
            </Typography>
            <Typography variant="caption" sx={{ color: expired ? 'error.main' : 'text.secondary', fontSize: '0.78rem', fontWeight: expired ? 600 : 400 }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Valid until:</span> {formatDMY(doc?.valid_until || values?.valid_until)}
              {expired && (
                <Chip size="small" label="Expired" color="error" sx={{ height: 18, fontSize: 10, fontWeight: 700, ml: 0.75 }} />
              )}
            </Typography>
          </Stack>
        </Stack>

        {/* Right: Prev / Next Navigation */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { xs: 0, sm: 'auto' } }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ArrowBackIcon sx={{ fontSize: 15 }} />}
            disabled={!prevQuotation}
            onClick={() => prevQuotation && openQuotation(prevQuotation)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '7px',
              height: 28,
              fontSize: '0.75rem',
              color: '#475569',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            Previous Quotation
          </Button>
          <Button
            size="small"
            variant={isSuperseded && nextQuotation ? 'contained' : 'outlined'}
            color={isSuperseded && nextQuotation ? 'primary' : 'inherit'}
            endIcon={<ArrowForwardIcon sx={{ fontSize: 15 }} />}
            disabled={!nextQuotation}
            onClick={() => nextQuotation && openQuotation(nextQuotation)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '7px',
              height: 28,
              fontSize: '0.75rem',
              color: isSuperseded && nextQuotation ? '#ffffff' : '#475569',
              borderColor: '#cbd5e1',
              bgcolor: isSuperseded && nextQuotation ? undefined : '#ffffff',
              '&:hover': { borderColor: '#94a3b8' },
            }}
          >
            {isSuperseded && (familyNext || revisionNext)
              ? `Next (${familyNext || revisionNext})`
              : 'Next Quotation'}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}
