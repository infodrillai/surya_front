import { Box, Autocomplete, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { getList } from '../api/client';
import { useMasters } from '../hooks/useMasters';
import { fmtNum } from '../lib/format';

/** Human label for a master record in dropdowns. */
export const labelOf = (master, r) => {
  if (master === 'Product') {
    const ratioPart = r.ratio != null ? ` (Ratio: ${r.ratio})` : '';
    return `${r.product_code} · ${r.product_name}${ratioPart}`;
  }
  return r.name;
};

const ZERO_BLANK_FIELDS = [
  'belt_length',
  'length',
  'belt_width',
  'width',
  'hole',
  'holes',
  'max_purchase_qty',
  'low_stock_limit',
  'high_stock_limit',
];

function LinkInput({ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }) {
  const handleChange = (_, v) => {
    const val = v ?? '';
    rf.onChange(val);
    if (f.onChange && setValue && getValues) {
      // Build a mutable proxy for the current row so onChange can read/write siblings
      const row = { ...(rowPath ? getValues(rowPath) : getValues()), [f.name]: val };
      const proxy = new Proxy(row, {
        set(target, key, value) {
          target[key] = value;
          if (getValues(rowPath ? `${rowPath}.${f.name}` : f.name) === val) setValue(rowPath ? `${rowPath}.${key}` : key, value, { shouldDirty: true });
          return true;
        },
      });
      // onChange may be async; fire-and-forget
      Promise.resolve(f.onChange(proxy, { values: getValues() })).catch((e) => console.warn('Field onChange error:', e));
    }
  };
  return (
    <Autocomplete
      size="small"
      disabled={disabled}
      options={options}
      value={rf.value || null}
      onChange={handleChange}
      getOptionLabel={(o) => labels[o] ?? o}
      isOptionEqualToValue={(a, b) => a === b}
      renderInput={(p) => <TextField {...p} label={f.label} error={!!error} helperText={error?.message} />}
      sx={{ minWidth: f.minWidth ?? 170 }}
    />
  );
}

function MasterLink({ f, rf, error, disabled, rowPath, setValue, getValues }) {
  const rows = useMasters(f.master);
  const { options, labels } = useMemo(() => {
    const list = rows.filter((r) => !f.filter || f.filter(r));
    return { options: list.map((r) => r.name), labels: Object.fromEntries(list.map((r) => [r.name, labelOf(f.master, r)])) };
  }, [rows, f]);
  return <LinkInput {...{ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }} />;
}

/** Link to a transactional doctype (e.g. Sales Order) - loaded from the server, not the cache. */
function ServerLink({ f, rf, error, disabled, rowPath, setValue, getValues }) {
  const { data = [] } = useQuery({ queryKey: ['list', f.doctype], queryFn: () => getList(f.doctype) });
  const options = useMemo(() => data.filter((r) => !f.filter || f.filter(r)).map((r) => r.name), [data, f]);
  const labels = Object.fromEntries(data.map(r => [r.name, f.labelField ? `${r[f.labelField]} · ${[r.customer, r.competitor].filter(Boolean).join(' / ') || r.name}` : r.name]));
  return <LinkInput {...{ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }} />;
}

export default function Field({ f, name, control, disabled, rowPath, setValue, getValues }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: rf, fieldState: { error } }) => {
        const label = f.label + (f.required ? ' *' : '');
        const off = disabled || f.readOnly;
        if (f.type === 'image') {
          const val = String(rf.value || '').trim();
          const hasImg = val && (val.startsWith('/files/') || val.startsWith('/private/files/') || val.startsWith('files/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/'));
          return hasImg ? (
            <Box
              component="img"
              src={val}
              alt={f.label}
              sx={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 1, border: '1px solid #e0e0e0', bgcolor: '#fafafa' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, fontStyle: 'italic' }}>
              No img
            </Typography>
          );
        }
        if (f.type === 'check')
          return <FormControlLabel label={f.label} control={<Checkbox checked={!!Number(rf.value)} disabled={off} onChange={(e) => rf.onChange(e.target.checked ? 1 : 0)} />} />;
        if (f.type === 'link') return f.master
          ? <MasterLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />
          : <ServerLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />;
        if (f.readOnly) {
          const num = ['number', 'currency', 'percent'].includes(f.type);
          return <TextField label={f.label} value={num ? fmtNum(rf.value, f.dp ?? (f.type === 'currency' ? 2 : 3)) : rf.value ?? ''} disabled sx={{ minWidth: f.minWidth ?? 110 }} />;
        }

        const isNum = ['number', 'currency', 'percent'].includes(f.type);
        const shouldBlankZero = ZERO_BLANK_FIELDS.includes(f.name);
        const displayVal = shouldBlankZero && (rf.value === 0 || rf.value === '0') ? '' : (rf.value ?? '');

        // Build a row-proxy handler for non-link editable fields (num, currency, text)
        const handleFieldChange = (e) => {
          let val = e.target.value;
          // Strip leading 0 when typing a number (e.g. typing 5 over 0 becomes '5' instead of '05')
          if (isNum && typeof val === 'string' && /^0+[1-9]/.test(val)) {
            val = val.replace(/^0+/, '');
            e.target.value = val;
          }
          rf.onChange(e);
          if (f.onChange && setValue && getValues) {
            const parsedVal = isNum ? (val === '' ? '' : Number(val)) : val;
            const row = { ...(rowPath ? getValues(rowPath) : getValues()), [f.name]: parsedVal };
            const proxy = new Proxy(row, {
              set(target, key, value) {
                target[key] = value;
                setValue(rowPath ? `${rowPath}.${key}` : key, value, { shouldDirty: true });
                return true;
              },
            });
            Promise.resolve(f.onChange(proxy, { values: getValues() })).catch((err) => console.warn('Field onChange error:', err));
          }
        };

        const handleFocusOrClick = (e) => {
          if (isNum && (e.target.value === '0' || Number(e.target.value) === 0)) {
            e.target.select();
          }
        };

        return (
          <TextField
            {...rf}
            value={displayVal}
            label={label}
            disabled={off}
            error={!!error}
            helperText={error?.message}
            select={f.type === 'select'}
            multiline={f.type === 'textarea'}
            minRows={f.type === 'textarea' ? 2 : undefined}
            type={isNum ? 'number' : f.type === 'date' ? 'date' : 'text'}
            slotProps={{
              inputLabel: f.type === 'date' ? { shrink: true } : undefined,
              htmlInput: isNum ? { step: 'any', min: f.allowNegative ? undefined : 0 } : undefined,
            }}
            sx={{ minWidth: f.minWidth ?? 110 }}
            onChange={handleFieldChange}
            onFocus={handleFocusOrClick}
            onClick={handleFocusOrClick}
          >
            {f.type === 'select' &&
              f.options.map((o) => {
                const val = typeof o === 'object' && o !== null ? o.value : o;
                const lbl = typeof o === 'object' && o !== null ? o.label : o;
                return (
                  <MenuItem key={val} value={val}>
                    {lbl}
                  </MenuItem>
                );
              })}
          </TextField>
        );
      }}
    />
  );
}
