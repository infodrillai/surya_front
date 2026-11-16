import React from 'react';
import { Alert, Button, Chip, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PostAddIcon from '@mui/icons-material/PostAdd';
import { useQueryClient } from '@tanstack/react-query';
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
  const qc = useQueryClient();
  const name = doc?.name;
  const [allList, setAllList] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  // Fetch or retrieve quotation list.
  // Checks React Query's ['list', 'Quotation'] first (already loaded by CrudPage).
  // Falls back to getList('Quotation') without requesting custom fields that might not exist in Frappe.
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
        // Ensure the currently viewed doc is always present in the list
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
          // Natural sort by name (e.g. QTN-00001, QTN-00002, …) for stable prev/next order
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

  // Resolve previous quotation:
  // 1. Previous version in the revision family
  // 2. Explicit doc.previous_version or doc.parent_quotation
  // 3. Name-order neighbour in the general quotation list
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

  // Resolve next quotation:
  // 1. Next revision in the version family
  // 2. Direct revision child (revisionNext)
  // 3. doc.superseded_by
  // 4. Name-order neighbour in the general quotation list (listNext)
  let nextQuotation = familyNext || (revisionNext && revisionNext !== name ? revisionNext : null) || (supersededBy && supersededBy !== name ? supersededBy : null) || listNext;
  if (nextQuotation === name) nextQuotation = null;

  const isSuperseded = doc?.status === 'Superseded';
  const status = doc?.status;
  const canRevise = name && !familyNext && !revisionNext && !supersededBy && !['Superseded', 'Accepted'].includes(status);

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
            variant={isSuperseded && nextQuotation ? 'contained' : 'outlined'}
            color={isSuperseded && nextQuotation ? 'primary' : 'inherit'}
            endIcon={<ArrowForwardIcon />}
            disabled={!nextQuotation}
            onClick={() => nextQuotation && openQuotation(nextQuotation)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {isSuperseded && (familyNext || revisionNext)
              ? `Next Quotation (${familyNext || revisionNext})`
              : 'Next Quotation'}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    </Stack>
  );
}
