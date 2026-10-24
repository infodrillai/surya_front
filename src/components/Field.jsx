import { Autocomplete, Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material';
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

function LinkInput({ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }) {
  const handleChange = (_, v) => {
    const val = v ?? '';
    rf.onChange(val);
    if (f.onChange && rowPath && setValue && getValues) {
      // Build a mutable proxy for the current row so onChange can read/write siblings
      const row = { ...getValues(rowPath), [f.name]: val };
      const proxy = new Proxy(row, {
        set(target, key, value) {
          target[key] = value;
          setValue(`${rowPath}.${key}`, value);
          return true;
        },
      });
      // onChange may be async; fire-and-forget
      Promise.resolve(f.onChange(proxy)).catch((e) => console.warn('Field onChange error:', e));
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
  return <LinkInput {...{ f, rf, error, disabled, options, labels: {}, rowPath, setValue, getValues }} />;
}

export default function Field({ f, name, control, disabled, rowPath, setValue, getValues }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: rf, fieldState: { error } }) => {
        const label = f.label + (f.required ? ' *' : '');
        const off = disabled || f.readOnly;
        if (f.type === 'check')
          return <FormControlLabel label={f.label} control={<Checkbox checked={!!Number(rf.value)} disabled={off} onChange={(e) => rf.onChange(e.target.checked ? 1 : 0)} />} />;
        if (f.type === 'link') return f.master
          ? <MasterLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />
          : <ServerLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />;
        if (f.readOnly) {
          const num = ['number', 'currency', 'percent'].includes(f.type);
          return <TextField label={f.label} value={num ? fmtNum(rf.value, f.dp ?? (f.type === 'currency' ? 2 : 3)) : rf.value ?? ''} disabled sx={{ minWidth: f.minWidth ?? 110 }} />;
        }
        // Build a row-proxy handler for non-link editable fields (num, currency, text)
        const handleFieldChange = (e) => {
          rf.onChange(e);
          if (f.onChange && rowPath && setValue && getValues) {
            const val = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
            const row = { ...getValues(rowPath), [f.name]: val };
            const proxy = new Proxy(row, {
              set(target, key, value) {
                target[key] = value;
                setValue(`${rowPath}.${key}`, value);
                return true;
              },
            });
            Promise.resolve(f.onChange(proxy)).catch((err) => console.warn('Field onChange error:', err));
          }
        };
        return (
          <TextField
            {...rf}
            value={rf.value ?? ''}
            label={label}
            disabled={off}
            error={!!error}
            helperText={error?.message}
            select={f.type === 'select'}
            multiline={f.type === 'textarea'}
            minRows={f.type === 'textarea' ? 2 : undefined}
            type={['number', 'currency', 'percent'].includes(f.type) ? 'number' : f.type === 'date' ? 'date' : 'text'}
            slotProps={{
              inputLabel: f.type === 'date' ? { shrink: true } : undefined,
              htmlInput: ['number', 'currency', 'percent'].includes(f.type) ? { step: 'any', min: 0 } : undefined,
            }}
            sx={{ minWidth: f.minWidth ?? 110 }}
            onChange={f.onChange && rowPath ? handleFieldChange : rf.onChange}
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
