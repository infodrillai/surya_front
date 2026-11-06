import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { insertDoc, runAction, updateDoc } from '../api/client';
import { reloadMasters } from '../db/masterCache';
import { useFinishedCost } from '../hooks/useFinishedCost';
import { useMasterMaps } from '../hooks/useMasters';
import { buildDefaults, buildSchema, cleanPayload } from '../lib/schema';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import ChildTable from './ChildTable';
import Field from './Field';

const differs = (a, b) => (a == null ? b != null : typeof b === 'number' ? Math.abs((Number(a) || 0) - b) > 1e-9 : a !== b);

/** Apply a { top, rows } patch produced by config.compute without causing a render loop. */
function applyPatch({ setValue, getValues }, patch) {
  Object.entries(patch.top || {}).forEach(([k, v]) => differs(getValues(k), v) && setValue(k, v));
  Object.entries(patch.rows || {}).forEach(([t, rows]) =>
    rows.forEach((r, i) => Object.entries(r).forEach(([k, v]) => differs(getValues(`${t}.${i}.${k}`), v) && setValue(`${t}.${i}.${k}`, v))),
  );
}

/** Generic add / edit dialog for every resource: RHF + Zod, live calculation, Complete / Reopen. */
export default function DocForm({ config, doc, open, onClose }) {
  const qc = useQueryClient();
  const notify = useUiStore((s) => s.notify);
  const { isAdmin, companyState, user } = useAuthStore();
  const masters = useMasterMaps();
  const { data: finishedCost = {} } = useFinishedCost(!!config.usesFinishedCost);
  const registry = useRef({});
  const loadedKey = useRef(null);
  const [tab, setTab] = useState(0);

  const schema = useMemo(() => buildSchema(config), [config]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: buildDefaults(config, doc) });
  const { control, handleSubmit, reset, setValue, getValues, formState: { errors } } = form;
  const values = useWatch({ control });
  const locked = !!doc?.is_completed || !!config.isLocked?.(doc);
  const isNew = !doc?.name;
  const quotation = config.doctype === 'Quotation';
  const draftKey = `surya:quotation-draft:${user}:${doc?.name || 'new'}`;
  const [draftMessage, setDraftMessage] = useState('');
  const dirty = useRef(false);
  const draftSuppressed = useRef(false);
  dirty.current = form.formState.isDirty;

  const writeRecovery = () => {
    if (!quotation || !open || locked || !dirty.current || draftSuppressed.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values: getValues(), modified: doc?.modified, saved: new Date().toISOString() }));
      setDraftMessage('Recovery draft saved on this device. Use Save as Draft to save it to the server.');
    } catch { setDraftMessage('Device recovery is unavailable. Use Save as Draft to retain your work.'); }
  };
  useEffect(() => {
    if (!quotation || !open || locked || !form.formState.isDirty) return;
    const timer = setTimeout(writeRecovery, 2000);
    return () => clearTimeout(timer);
  }, [values, open, locked, draftKey, form.formState.isDirty]);
  useEffect(() => {
    if (!quotation || !open) return;
    window.addEventListener('pagehide', writeRecovery);
    return () => { window.removeEventListener('pagehide', writeRecovery); writeRecovery(); };
  }, [open, quotation, draftKey, locked]);

  const cancel = () => {
    if (quotation && !locked && (dirty.current || draftMessage) && !window.confirm('Discard this entry and its device recovery draft? Cancel to continue editing.')) return;
    draftSuppressed.current = true;
    if (quotation && !locked) { try { localStorage.removeItem(draftKey); } catch {} }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      let initial = { ...(doc || {}) };
      if (doc?.name && config.companion?.load) {
        try {
          const comp = await config.companion.load(doc);
          if (comp) initial = { ...initial, ...comp };
        } catch (e) {
          console.error('Failed to load companion data:', e);
        }
      }
      if (!active) return;
      let d = buildDefaults(config, initial);
      setDraftMessage('');
      draftSuppressed.current = false;
      if (quotation && !locked) {
        try {
          const recovery = JSON.parse(localStorage.getItem(draftKey) || 'null');
          if (recovery && window.confirm(`Recover your quotation draft saved ${recovery.saved}?${doc?.modified !== recovery.modified ? ' The server document has changed; review before saving.' : ''}`)) {
            d = buildDefaults(config, { ...initial, ...recovery.values });
            setDraftMessage('Recovered device draft. Review and save your changes.');
          }
        } catch { /* A failed local recovery must not stop the form opening. */ }
      }
      reset(d);
      loadedKey.current = doc?.name ? config.loadKey?.(d) ?? null : null;
      setTab(0);

      // For quotations with saved items: re-fetch product info for any row
      // where production_cost is 0 (the server may not have stored it).
      if (active && quotation && config.fixItems && d.items?.length) {
        try {
          const fixedItems = await config.fixItems(d.items);
          if (active && fixedItems) {
            fixedItems.forEach((row, i) => {
              Object.entries(row).forEach(([k, v]) => {
                setValue(`items.${i}.${k}`, v, { shouldDirty: false });
              });
            });
          }
        } catch (_) { /* fixItems failure must not break the form */ }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, doc, config, reset]);

  // live preview (server stays authoritative)
  useEffect(() => {
    if (open && !locked && config.compute) applyPatch(form, config.compute(values, { masters, finishedCost, companyState }));
  }, [values, masters, finishedCost]); // eslint-disable-line react-hooks/exhaustive-deps

  // load BOM rows / order lines when the key fields change
  useEffect(() => {
    if (!open || locked || !config.loadRows) return undefined;
    const key = config.loadKey(values);
    if (!key || key === loadedKey.current) return undefined;
    const t = setTimeout(async () => {
      loadedKey.current = key;
      try {
        const patch = await config.loadRows(values, { finishedCost });
        Object.entries(patch.tables || {}).forEach(([name, rows]) => registry.current[name]?.(rows));
        Object.entries(patch.top || {}).forEach(([k, v]) => form.setValue(k, v));
      } catch (e) {
        notify(e.message, 'error');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [values, open, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterChange = async () => {
    await qc.invalidateQueries();
    if (config.master) await reloadMasters([config.doctype, ...(config.companion ? [config.companion.doctype] : [])]);
  };

  const save = useMutation({
    mutationFn: async (vals) => {
      const all = cleanPayload(vals);
      const co = config.companion;
      let main = config.beforeSave ? config.beforeSave({ ...all }) : { ...all };
      const extra = {};
      (co?.tables || []).forEach((k) => { extra[k] = main[k] || []; delete main[k]; });
      const saved = isNew ? await insertDoc(config.doctype, main) : await updateDoc(config.doctype, doc.name, main);
      if (co) await co.save({ ...saved, product_type: all.product_type, total_steps: all.total_steps, finished_good_type: all.finished_good_type }, extra);
      return saved;
    },
    onError: (e) => notify(e.message, 'error'),
  });
  const act = useMutation({
    mutationFn: ({ name, action }) => config.runAction ? config.runAction(name, action) : runAction(config.doctype, name, action),
    onError: (e) => notify(e.message, 'error'),
  });

  const tableError = (tName) => {
    const err = errors[tName];
    if (!err) return null;
    if (typeof err.message === 'string') return err.message;
    if (Array.isArray(err)) {
      for (const rowErr of err) {
        if (rowErr) {
          for (const fErr of Object.values(rowErr)) {
            if (fErr?.message) return fErr.message;
          }
        }
      }
    }
    return null;
  };

  const invalid = (errs) => {
    if (config.tableTabs && tables.length) {
      const errTabIndex = tables.findIndex((t) => tableError(t.name));
      if (errTabIndex >= 0) setTab(errTabIndex);
    }
    const messages = [];
    const extract = (errObj) => {
      if (!errObj || typeof errObj !== 'object') return;
      if (errObj.message && typeof errObj.message === 'string') {
        messages.push(errObj.message);
      } else {
        Object.values(errObj).forEach(extract);
      }
    };
    extract(errs);
    const unique = [...new Set(messages)];
    notify(unique.length ? `Please fix: ${unique.join(' · ')}` : 'Fix the highlighted fields first.', 'warning');
  };
  const onSave = handleSubmit(async (vals) => {
    await save.mutateAsync(quotation ? { ...vals, status: doc?.status === 'Approved' ? 'Approved' : 'Sent' } : vals);
    draftSuppressed.current = true;
    if (quotation) { try { localStorage.removeItem(draftKey); } catch {} }
    await afterChange();
    notify('Saved');
    onClose();
  }, invalid);
  const onSaveDraft = handleSubmit(async (vals) => {
    await save.mutateAsync({ ...vals, status: 'Draft' });
    draftSuppressed.current = true;
    try { localStorage.removeItem(draftKey); } catch {}
    await afterChange();
    notify('Draft saved to server');
    onClose();
  }, invalid);
  const onComplete = handleSubmit(async (vals) => {
    const saved = await save.mutateAsync(vals);
    await act.mutateAsync({ name: saved.name, action: 'complete' });
    await afterChange();
    notify(`${config.title} completed`);
    onClose();
  }, invalid);
  const onReopen = async () => {
    await act.mutateAsync({ name: doc.name, action: 'reopen' });
    await afterChange();
    notify(`${doc.name} reopened`, 'info');
    onClose();
  };

  const visible = (f) => !f.hidden && (!f.showIf || f.showIf(values, { isNew, doc }));
  const main = config.fields.filter((f) => !f.summary && visible(f));
  const summary = config.fields.filter((f) => f.summary);
  const tables = (config.tables || []).filter((t) => !t.showIf || t.showIf(values, { isNew, doc }));
  const banner = config.banner?.(values);
  const busy = save.isPending || act.isPending;

  const tableView = (t) => {
    const err = tableError(t.name);
    return (
      <Box key={t.name}>
        {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
        <ChildTable
          table={t}
          control={control}
          disabled={locked}
          registry={registry}
          setValue={setValue}
          getValues={getValues}
          isNew={isNew}
          doc={doc}
        />
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : cancel} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
          <span>{isNew ? `New ${config.title}` : `${config.title} ${doc.name}`}</span>
          {config.completable && !isNew && <Chip size="small" color={doc.is_completed ? 'success' : 'default'} label={doc.is_completed ? 'Completed' : 'Draft'} />}
          {(() => { const s = config.getEffectiveStatus ? config.getEffectiveStatus(doc) : doc?.status; return s ? <Chip size="small" variant="outlined" color={s === "Disapproved" || s === "Rejected" ? "error" : "default"} label={s} /> : null; })()}
        </Box>
        {config.titleActions?.(values, doc)}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {locked && <Alert severity="info">This document is read-only{doc?.is_completed ? ' because it is completed. An Admin can reopen it.' : '.'}</Alert>}
          {banner && <Alert severity={banner.severity}>{banner.text}</Alert>}
          {quotation && draftMessage && <Alert severity="info">{draftMessage}</Alert>}
          {config.header?.(values, doc)}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
            {main.map((f) => (
              <Box key={f.name} sx={{ gridColumn: f.type === 'textarea' ? '1 / -1' : undefined }}>
                <Field f={{ ...f, readOnly: f.readOnly || (f.readOnlyOnEdit && !isNew) }} name={f.name} control={control} disabled={locked} setValue={setValue} getValues={getValues} />
              </Box>
            ))}
          </Box>
          {config.tableTabs ? (
            tables.length ? (
              <Box>
                <Tabs value={Math.min(tab, tables.length - 1)} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                  {tables.map((t) => (
                    <Tab
                      key={t.name}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                          <span>{t.label}</span>
                          {tableError(t.name) && (
                            <Chip size="small" color="error" label="!" sx={{ height: 18, width: 18, fontSize: 11, '& .MuiChip-label': { px: 0 } }} />
                          )}
                        </Box>
                      }
                      sx={tableError(t.name) ? { color: 'error.main' } : undefined}
                    />
                  ))}
                </Tabs>
                {tableView(tables[Math.min(tab, tables.length - 1)])}
              </Box>
            ) : (config.tableTabsEmpty ?? 'Choose a product to see its stages.') ? <Typography color="text.secondary">{config.tableTabsEmpty ?? 'Choose a product to see its stages.'}</Typography> : null
          ) : (
            tables.map((t) => (
              <Box key={t.name}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{t.label}</Typography>
                {tableView(t)}
              </Box>
            ))
          )}
          {summary.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#eef6f4' }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{config.summaryTitle || 'Summary'}</Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: `repeat(${config.summaryColumns || Math.min(summary.length, 6)}, 1fr)`,
                  },
                }}
              >
                {summary.map((f) => (
                  <Field
                    key={f.name}
                    f={{ ...f, readOnly: f.editable ? false : true }}
                    name={f.name}
                    control={control}
                    disabled={locked}
                  />
                ))}
              </Box>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={cancel} disabled={busy}>{quotation ? 'Cancel' : 'Close'}</Button>
        {quotation && !locked && doc?.status !== 'Approved' && <Button variant="outlined" onClick={onSaveDraft} disabled={busy}>Save as Draft</Button>}
        {config.completable && !isNew && doc.is_completed && isAdmin && <Button color="warning" onClick={onReopen} disabled={busy}>Reopen</Button>}
        {!locked && <Button variant="outlined" onClick={onSave} disabled={busy}>Save</Button>}
        {!locked && config.completable && <Button variant="contained" onClick={onComplete} disabled={busy}>Save and complete</Button>}
      </DialogActions>
    </Dialog>
  );
}
