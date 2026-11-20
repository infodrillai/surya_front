import { Box, Autocomplete, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { getList, uploadFile } from '../api/client';
import { useMasters } from '../hooks/useMasters';
import { fmtNum } from '../lib/format';

/** Human label for a master record in dropdowns. */
export const labelOf = (master, r) => {
  if (master === 'Product') {
    const ratioPart = r.ratio != null ? ` (Ratio: ${r.ratio})` : '';
    const compPart = r.competitor_company_code ? ` [Comp: ${r.competitor_company_code}]` : '';
    return `${r.product_name || r.product_code || r.name}${compPart}${ratioPart}`;
  }
  if (master === 'Currency') {
    const sym = r.symbol ? ` (${r.symbol})` : '';
    const nm = r.currency_name && r.currency_name !== r.name ? `${r.name} - ${r.currency_name}` : (r.currency_name || r.name);
    return `${nm}${sym}`;
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

function ImageInput({ f, rf, disabled, rowPath }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const value = String(rf.value || '').trim();

  const isTableRow = Boolean(rowPath || f.readOnly);

  const selectFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }

    setError('');
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      try {
        const fileUrl = await uploadFile(file, {
          doctype: f.docname ? f.doctype : undefined,
          docname: f.docname || undefined,
          fieldname: f.docname ? f.name : undefined,
        });
        rf.onChange(fileUrl || dataUrl);
      } catch (uploadError) {
        console.warn('Image upload endpoint notice, using local data URL:', uploadError);
        rf.onChange(dataUrl);
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError('Could not read image file.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  if (isTableRow) {
    return (
      <Box
        sx={{
          width: 34,
          height: 34,
          minWidth: 34,
          borderRadius: 1,
          border: '1px solid #d1d5db',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          bgcolor: '#f8fafc',
          m: 'auto',
        }}
      >
        {value ? (
          <Box
            component="img"
            src={value}
            alt="Product"
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>—</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: f.minWidth ?? 140 }}>
      <Box
        sx={{
          width: 52,
          height: 52,
          minWidth: 52,
          borderRadius: 1.5,
          border: '1px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          bgcolor: '#f8fafc',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        {value ? (
          <Box
            component="img"
            src={value}
            alt={f.label || 'Product'}
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', px: 0.5 }}>
            No image
          </Typography>
        )}
      </Box>
      {!disabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={selectFile} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1 }}
          >
            {uploading ? <CircularProgress size={16} sx={{ mr: 0.5 }} /> : null}
            {value ? 'Change from device' : 'Choose from device / drive'}
          </Button>
          {value && (
            <Button
              size="small"
              color="error"
              onClick={() => { rf.onChange(''); setError(''); }}
              disabled={uploading}
              sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0, px: 0.5, alignSelf: 'flex-start' }}
            >
              Remove
            </Button>
          )}
        </Box>
      )}
      {error && <Typography variant="caption" color="error">{error}</Typography>}
    </Box>
  );
}

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
      Promise.resolve(f.onChange(proxy, { values: getValues(), setValue, getValues })).catch((e) => console.warn('Field onChange error:', e));
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
      renderInput={(p) => (
        <TextField
          {...p}
          label={f.label}
          error={!!error}
          helperText={error?.message}
          title={labels[rf.value] ?? rf.value ?? ''}
        />
      )}
      sx={{
        minWidth: f.minWidth ?? (rowPath ? 130 : 170),
        width: '100%',
        '& .MuiAutocomplete-endAdornment': disabled ? { display: 'none' } : undefined,
        '& .MuiInputBase-root': rowPath ? {
          fontSize: '0.8rem',
          height: 32,
          py: 0.25,
          px: 0.5,
        } : undefined,
        '& .MuiInputBase-input': {
          fontSize: '0.8rem',
          textOverflow: 'ellipsis',
          py: 0.25,
        },
      }}
    />
  );
}

function MasterLink({ f, rf, error, disabled, rowPath, setValue, getValues }) {
  const cachedRows = useMasters(f.master);
  const { data: serverRows = [] } = useQuery({
    queryKey: ['masterLinkFallback', f.master],
    queryFn: async () => {
      try {
        const res = await getList(f.master);
        return Array.isArray(res) ? res : [];
      } catch (err) {
        return [];
      }
    },
    enabled: !cachedRows || cachedRows.length === 0,
    staleTime: 60000,
  });

  const rows = cachedRows && cachedRows.length > 0 ? cachedRows : serverRows;

  const { options, labels } = useMemo(() => {
    let list = rows.filter((r) => !f.filter || f.filter(r));
    if (f.master === 'Currency' && list.length === 0) {
      list = [
        { name: 'INR', currency_name: 'INR', symbol: '₹' },
        { name: 'USD', currency_name: 'USD', symbol: '$' },
        { name: 'EUR', currency_name: 'EUR', symbol: '€' },
        { name: 'GBP', currency_name: 'GBP', symbol: '£' },
        { name: 'AED', currency_name: 'AED', symbol: 'د.إ' },
      ];
    }
    const optSet = new Set(list.map((r) => r.name));
    if (rf.value && !optSet.has(rf.value)) {
      list = [{ name: rf.value, currency_name: rf.value }, ...list];
    }
    return {
      options: list.map((r) => r.name),
      labels: Object.fromEntries(list.map((r) => [r.name, labelOf(f.master, r)])),
    };
  }, [rows, f, rf.value]);

  return <LinkInput {...{ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }} />;
}

/** Link to a transactional doctype (e.g. Sales Order) - loaded from the server, not the cache. */
function ServerLink({ f, rf, error, disabled, rowPath, setValue, getValues }) {
  const { data = [] } = useQuery({ queryKey: ['list', f.doctype], queryFn: () => getList(f.doctype) });
  const options = useMemo(() => data.filter((r) => !f.filter || f.filter(r)).map((r) => r.name), [data, f]);
  const labels = Object.fromEntries(data.map(r => [r.name, f.labelField ? `${r[f.labelField]} · ${[r.customer, r.competitor].filter(Boolean).join(' / ') || r.name}` : r.name]));
  return <LinkInput {...{ f, rf, error, disabled, options, labels, rowPath, setValue, getValues }} />;
}

function fixedDecimal(value, digits) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return value ?? '';
  return Number(value).toFixed(digits);
}

export default function Field({ f, name, control, disabled, rowPath, setValue, getValues }) {
  const [focused, setFocused] = useState(false);
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: rf, fieldState: { error } }) => {
        const label = f.label + (f.required ? ' *' : '');
        const off = disabled || f.readOnly;
        if (f.type === 'image') return <ImageInput f={f} rf={rf} disabled={off} rowPath={rowPath} />;
        if (f.type === 'check')
          return <FormControlLabel label={f.label} control={<Checkbox checked={!!Number(rf.value)} disabled={off} onChange={(e) => rf.onChange(e.target.checked ? 1 : 0)} />} />;
        if (f.type === 'link') return f.master
          ? <MasterLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />
          : <ServerLink {...{ f, rf, error, rowPath, setValue, getValues }} disabled={off} />;
        if (f.readOnly) {
          const num = ['number', 'currency', 'percent'].includes(f.type);
          return (
            <TextField
              label={f.label}
              value={num
                ? (f.fixedDp == null ? fmtNum(rf.value, f.dp ?? (f.type === 'currency' ? 2 : 3)) : fixedDecimal(rf.value, f.fixedDp))
                : rf.value ?? ''}
              disabled
              size="small"
              sx={{
                minWidth: f.minWidth ?? (rowPath ? 50 : 110),
                width: '100%',
                '& .MuiInputBase-root': rowPath ? {
                  fontSize: '0.8rem',
                  height: 32,
                  bgcolor: 'action.hover',
                } : undefined,
                '& .MuiInputBase-input': rowPath ? {
                  py: 0.25,
                  px: 0.5,
                  fontSize: '0.8rem',
                  textAlign: num ? 'right' : 'left',
                } : undefined,
              }}
            />
          );
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
            value={isNum && f.fixedDp != null && !focused ? fixedDecimal(displayVal, f.fixedDp) : displayVal}
            label={label}
            disabled={off}
            error={!!error}
            helperText={error?.message}
            size="small"
            select={f.type === 'select'}
            multiline={f.type === 'textarea'}
            minRows={f.type === 'textarea' ? 2 : undefined}
            type={isNum ? 'number' : f.type === 'date' ? 'date' : 'text'}
            slotProps={{
              inputLabel: f.type === 'date' ? { shrink: true } : undefined,
              htmlInput: isNum ? { step: 'any', min: f.allowNegative ? undefined : 0 } : undefined,
            }}
            sx={{
              minWidth: f.minWidth ?? (rowPath ? 50 : 110),
              width: '100%',
              '& .MuiInputBase-root': rowPath ? {
                fontSize: '0.8rem',
                height: 32,
              } : undefined,
              '& .MuiInputBase-input': rowPath ? {
                py: 0.25,
                px: 0.5,
                fontSize: '0.8rem',
                textAlign: isNum ? 'right' : 'left',
              } : undefined,
            }}
            onChange={handleFieldChange}
            onFocus={(event) => {
              if (f.fixedDp != null) setFocused(true);
              handleFocusOrClick(event);
            }}
            onBlur={() => {
              if (f.fixedDp != null) setFocused(false);
              rf.onBlur();
            }}
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
