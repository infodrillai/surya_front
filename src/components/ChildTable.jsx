import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { Box, Button, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useFieldArray, useWatch } from 'react-hook-form';
import { useState } from 'react';
import Field from './Field';

/** Editable child table built on useFieldArray. `registry` lets the form replace rows after an API load. */
export default function ChildTable({ table, control, disabled, registry, setValue, getValues, isNew, doc }) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: table.name, keyName: '_key' });
  registry.current[table.name] = replace;
  const rows = useWatch({ control, name: table.name }) || [];
  const canEdit = !disabled && !table.readOnly;
  const [discountEditing, setDiscountEditing] = useState({});
  const inlineDiscount = table.itemDiscounts && rows.filter(r => Number(r.item_discount_percent) > 0).length <= 1;

  const visibleFields = table.fields.filter(
    (f) => !f.hidden && !(inlineDiscount && f.name === 'item_discount_percent') && (!f.showIf || f.showIf(rows, { isNew, doc }))
  );

  return (
    <Box>
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={40}>#</TableCell>
              {visibleFields.map((f) => <TableCell key={f.name}>{f.label}</TableCell>)}
              {canEdit && !table.noAdd && <TableCell width={48} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.length === 0 && (
              <TableRow><TableCell colSpan={visibleFields.length + 2}><Typography variant="body2" color="text.secondary">{table.empty || 'No rows yet.'}</Typography></TableCell></TableRow>
            )}
            {fields.map((row, i) => (
              <TableRow key={row._key} hover>
                <TableCell>{i + 1}</TableCell>
                {visibleFields.map((f) => (
                  <TableCell key={f.name} sx={{ py: 0.75 }}>
                    <Field
                      f={{ ...f, readOnly: f.readOnly || f.readOnlyIf?.(rows[i] || {}) }}
                      name={`${table.name}.${i}.${f.name}`}
                      control={control}
                      disabled={disabled}
                      rowPath={`${table.name}.${i}`}
                      setValue={setValue}
                      getValues={getValues}
                    />
                    {inlineDiscount && f.name === 'product' && (
                      Number(rows[i]?.item_discount_percent) > 0 || discountEditing[row._key] ?
                        <Box sx={{ mt: 1.5 }}><Field f={table.fields.find(field => field.name === 'item_discount_percent')} name={`${table.name}.${i}.item_discount_percent`} control={control} disabled={disabled} /></Box> :
                        canEdit && <Button size="small" onClick={() => setDiscountEditing(current => ({ ...current, [row._key]: true }))}>Add discount</Button>
                    )}
                  </TableCell>
                ))}
                {canEdit && !table.noAdd && (
                  <TableCell>
                    <IconButton size="small" disabled={!!rows[i]?.is_carried_in} onClick={() => remove(i)} aria-label="Remove row"><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {canEdit && !table.noAdd && (
        <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => append(table.newRow?.() ?? {})}>Add row</Button>
      )}
    </Box>
  );
}
