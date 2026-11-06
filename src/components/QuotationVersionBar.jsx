import React from 'react';
import { Alert, Button, Chip, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PostAddIcon from '@mui/icons-material/PostAdd';
import { getList, runAction } from '../api/client';

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

export default function QuotationVersionBar({ doc }) {
  const name = doc?.name;
  const [allList, setAllList] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  // Always fetch from server to get previous_version + parent_quotation.
  // Re-runs when doc name, version or modified changes (catches just-created revision).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await getList('Quotation', {
          fields: ['name', 'creation', 'version', 'status', 'previous_version', 'parent_quotation'],
          orderBy: 'name asc',
          limit: 1000,
        });
        if (!alive) return;
        if (Array.isArray(list) && list.length > 0) {
          // Sort by name (QTN-00001, QTN-00002, …) for stable prev/next order
          const sorted = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
  }, [name, doc?.version, doc?.modified]);

  // Find the direct revision of this doc (the quotation that superseded it)
  const revisionNext = allList.find(
    (q) => q.previous_version === name || q.parent_quotation === name
  )?.name || null;

  // For a Superseded doc, also check doc.superseded_by or any other hint the server returns
  const supersededBy = doc?.superseded_by || null;

  // Name-order neighbours — only used as prev/next for unrelated navigation (not version chain)
  const idx = name ? allList.findIndex((q) => q.name === name) : -1;
  const listPrev = idx > 0 ? allList[idx - 1]?.name : null;
  const listNext = idx >= 0 && idx < allList.length - 1 ? allList[idx + 1]?.name : null;

  // Prefer explicit version-chain links for prev; name-order neighbour otherwise
  const prevQuotation = doc?.previous_version || doc?.parent_quotation || listPrev;

  // For next: revision child takes priority (especially for Superseded docs).
  // Fall back to name-order only when there is NO version-chain link at all.
  const versionNext = revisionNext || supersededBy;
  const nextQuotation = versionNext || listNext;

  // True when navigating "next" means opening the revision (shown with a distinct label)
  const isSuperseded = doc?.status === 'Superseded';

  const status = doc?.status;
  // Allow revise only if no revision exists yet and not already locked
  const canRevise = name && !versionNext && !['Superseded', 'Accepted'].includes(status);

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
    const root = docParent ? findRoot(docParent) : findRoot(name);
    const chain = new Set();
    const addChain = (n) => {
      if (!n || chain.has(n)) return;
      chain.add(n);
      allList
        .filter((q) => q.previous_version === n || q.parent_quotation === n)
        .forEach((q) => addChain(q.name));
    };
    addChain(root);
    return allList.filter((q) => chain.has(q.name));
  }, [allList, name, doc]);

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
    <Stack spacing={1} sx={{ mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" justifyContent="space-between" useFlexGap>
        {/* Left: version chip + status + revise button */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {name && (
            <Chip size="small" color="info" variant="outlined" label={`Version ${doc?.version || 1}`} sx={{ fontWeight: 600 }} />
          )}
          {isSuperseded && versionNext && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`Superseded → ${versionNext}`}
              sx={{ fontWeight: 600, cursor: 'pointer' }}
              onClick={() => openQuotation(versionNext)}
            />
          )}
          {canRevise && (
            <Button size="small" variant="contained" startIcon={<PostAddIcon />} disabled={busy} onClick={revise} sx={{ textTransform: 'none' }}>
              Revise Quotation
            </Button>
          )}
        </Stack>

        {/* Right: Prev / Next navigation */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            disabled={!prevQuotation}
            onClick={() => prevQuotation && openQuotation(prevQuotation)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Previous Quotation
          </Button>
          <Button
            size="small"
            variant={isSuperseded && versionNext ? 'contained' : 'outlined'}
            color={isSuperseded && versionNext ? 'primary' : 'inherit'}
            endIcon={<ArrowForwardIcon />}
            disabled={!nextQuotation}
            onClick={() => nextQuotation && openQuotation(nextQuotation)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {isSuperseded && versionNext ? `Open Revision (${versionNext})` : 'Next Quotation'}
          </Button>
        </Stack>
      </Stack>

      {/* Version family chips */}
      {family.length > 1 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {family.map((q) => (
            <Chip
              key={q.name}
              size="small"
              clickable={q.name !== name}
              color={q.name === name ? 'primary' : 'default'}
              variant={q.name === name ? 'filled' : 'outlined'}
              label={`v${q.version || 1} · ${q.name} · ${q.status || 'Draft'}`}
              onClick={q.name === name ? undefined : () => openQuotation(q.name)}
            />
          ))}
        </Stack>
      )}

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    </Stack>
  );
}
