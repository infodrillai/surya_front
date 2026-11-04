import React, { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, Stack, Typography, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } from '@mui/material';
import { call, getDoc } from '../api/client';
import QuotationVersionBar from '../components/QuotationVersionBar';
import { useAuthStore } from '../stores/authStore';

const api = (name, args = {}) => call(`clssurya.utils.quotation_features.${name}`, args);
const number = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const read = (name, label) => ({ name, label, type: 'text', readOnly: true });
const link = (name, label, doctype, extra = {}) => ({ name, label, type: 'link', doctype, ...extra });

export async function quotationPdf(doc) {
  if (!doc?.name) throw new Error('Save the quotation before downloading its PDF.');
  const result = await api('download_pdf', { name: doc.name });
  const bytes = Uint8Array.from(atob(result.content), c => c.charCodeAt(0));
  return new File([bytes], result.filename, { type: 'application/pdf' });
}
export async function downloadQuotation(doc) {
  const file = await quotationPdf(doc);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function shareQuotation(doc) {
  const file = await quotationPdf(doc);
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Quotation ${doc.name}`, text: 'Please find the quotation attached.' });
  } else {
    const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.alert('The PDF has been downloaded. Open WhatsApp and attach this file to your customer conversation. Direct file sharing requires a browser with file sharing support.');
  }
}

function QuotationPanel({ doc, values }) {
  const creator = useAuthStore(state => state.fullName);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setError(''); setBusy(true); try { await fn(); } catch (e) { if (e.name !== 'AbortError') setError(e.message); } finally { setBusy(false); } };
  return <Stack spacing={1}>
    {doc?.name && <QuotationVersionBar doc={doc} />}
    <Typography variant="body2">Created by: {doc?.created_by_name || doc?.owner || creator || 'Current user'} · Currency: {values.currency || 'INR'} · Valid until: {doc?.valid_until || 'Calculated when saved'}</Typography>
    <Typography variant="caption">References are in the selected currency, per product master unit. Quoted quantities and rates use the selected line unit. Enter master units per quoted unit for unit conversion. A percentage is undefined when the cost base is zero.</Typography>
    <Stack direction="row" gap={1} flexWrap="wrap">
      {doc?.name && <>
        <Button disabled={busy} onClick={() => run(() => downloadQuotation(doc))}>Download PDF</Button>
        <Button disabled={busy} onClick={() => run(() => shareQuotation(doc))}>WhatsApp / Share PDF</Button>
        <Button disabled={busy} onClick={() => run(async () => { const recipient = window.prompt('Customer email address'); if (recipient) { await api('email_pdf', { name: doc.name, recipient }); window.alert('Quotation email queued.'); } })}>Email PDF</Button>
        <Button disabled={busy} onClick={() => run(async () => setDetail({ title: 'Generated PDFs', rows: await api('pdf_history', { name: doc.name }) }))}>PDF history</Button>
        <Button disabled={busy} onClick={() => run(async () => setDetail({ title: 'Quotation activity', rows: (await api('activity', { name: doc.name })).map(log => { let data = {}; try { data = JSON.parse(log.data); } catch {} return { user: log.owner, date: log.creation, changes: (data.changed || []).map(change => `${change[0].replaceAll('_', ' ')}: ${change[1] ?? 'empty'} → ${change[2] ?? 'empty'}`).join('; ') || 'Quotation items updated' }; }) }))}>Activity</Button>
      </>}
      <Button disabled={busy} onClick={() => run(async () => setDetail({ title: 'My sales performance', rows: await api('performance') }))}>Sales performance</Button>
      {(values.items || []).filter(r => r.product).map((r, i) => <Button key={`${r.product}-${i}`} disabled={busy} onClick={() => run(async () => {
        const info = await api('product_references', { product: r.product });
        setDetail({ title: `${r.product} · History (INR / master unit)`, rows: [...info.monthly_prices.map(p => ({ month: p.month, unit: p.uom, average_selling_price: p.average })), ...info.production_history] });
      })}>Price history: {r.product}</Button>)}
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="md"><DialogTitle>{detail?.title}</DialogTitle><DialogContent>
      {!detail?.rows?.length && <Typography>No records yet.</Typography>}
      {!!detail?.rows?.length && (detail.rows[0].file_url ? detail.rows.map((r, i) => <Box key={i} sx={{ py: 1 }}><a href={r.file_url} target="_blank" rel="noreferrer">{r.file_name} · {r.creation}</a></Box>) :
        <TableContainer><Table size="small"><TableHead><TableRow>{[...new Set(detail.rows.flatMap(row => Object.keys(row)))].map(key => <TableCell key={key}>{key.replaceAll('_', ' ')}</TableCell>)}</TableRow></TableHead>
        <TableBody>{detail.rows.map((row, i) => <TableRow key={i}>{[...new Set(detail.rows.flatMap(r => Object.keys(r)))].map(key => <TableCell key={key}>{typeof row[key] === 'number' ? row[key].toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(row[key] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>)}
    </DialogContent></Dialog>
  </Stack>;
}

async function setProduct(row) {
  if (!row.product) return;
  const product = row.product;
  const info = await api('product_references', { product });
  if (row.product !== product) return;
  row.uom = info.uom;
  row.production_cost = info.production_cost;
  row.base_cost_inr = info.production_cost;
  row.last_selling_price = info.last_selling_price;
  row.last_purchase_price = info.last_purchase_price;
  row.raw_material_cost = info.raw_material_cost;
  row.description = info.description || '';
  row.image = info.image || '';
  row.reference_exchange_rate = 1;
  row.pricing_mode = 'Percentage';
}

export function enhanceQuotation(config) {
  config.isLocked = d => ['Superseded', 'Accepted', 'Rejected', 'Disapproved'].includes(d?.status);
  config.header = (values, doc) => <QuotationPanel values={values} doc={doc} />;
  config.fields.splice(2, 0,
    number('validity_days', 'Validity (days)', { positive: true, default: () => 15 }),
    link('currency', 'Currency', 'Quotation Currency', { default: () => 'INR', required: true, filter: r => r.enabled, onChange: values => { values.exchange_rate = values.currency === 'INR' ? 1 : ''; } }),
    number('exchange_rate', 'Exchange rate (INR per currency unit)', { positive: true, required: true }),
    { name: 'remarks', label: 'Remarks', type: 'textarea' },
  );
  config.tables[0].itemDiscounts = true;
  const fields = config.tables[0].fields;
  fields.unshift(link('code_mapping', 'Customer / competitor code', 'Product Code Mapping', { labelField: 'external_code', onChange: async row => {
    if (!row.code_mapping) { row.external_code = ''; return; }
    const mapping = await getDoc('Product Code Mapping', row.code_mapping);
    row.external_code = mapping.external_code;
    row.product = mapping.product;
    await setProduct(row);
  } }));
  fields.find(f => f.name === 'product').onChange = async row => { row.code_mapping = ''; row.external_code = ''; await setProduct(row); };
  fields.find(f => f.name === 'production_cost').label = 'Cost / master unit';
  fields.find(f => f.name === 'uom').readOnly = false;
  Object.assign(fields.find(f => f.name === 'uom'), { type: 'link', master: 'UOM', required: true });
  Object.assign(fields.find(f => f.name === 'rate'), { readOnly: false, onChange: (row, { values }) => { row.pricing_mode = 'Rate'; row.rate_exchange_rate = values.currency === 'INR' ? 1 : Number(values.exchange_rate) || 1; } });
  Object.assign(fields.find(f => f.name === 'pr'), { allowNegative: true, onChange: row => { row.pricing_mode = 'Percentage'; } });
  fields.find(f => f.name === 'quantity').onChange = undefined;
  fields.push(number('conversion_factor', 'Master units per quoted unit', { positive: true, default: () => 1 }), read('external_code', 'Customer / competitor code'), read('description', 'Description'),
    { name: 'image', label: 'Product image', type: 'image', readOnly: true },
    { ...read('last_selling_price', 'Last sale (master unit)'), type: 'currency' },
    { ...read('last_purchase_price', 'Last purchase (master unit)'), type: 'currency' },
    { ...read('raw_material_cost', 'BOM raw cost (INR converted)'), type: 'currency' },
    number('item_discount_percent', 'Item discount (%)', { max: 100, default: () => 0 }),
  );
  config.tables[0].newRow = () => ({ quantity: 1, pr: 0, item_discount_percent: 0, pricing_mode: 'Percentage' });
  config.compute = (v, ctx) => {
    const fx = v.currency === 'INR' ? 1 : Number(v.exchange_rate) || 1;
    const items = (v.items || []).map(r => {
      const referenceFx = Number(r.reference_exchange_rate || fx);
      const cost = (r.base_cost_inr != null ? Number(r.base_cost_inr) : (Number(r.production_cost) || 0) * referenceFx) / fx;
      const unitCost = cost * (Number(r.conversion_factor) || 1);
      const rate = r.pricing_mode === 'Percentage' ? unitCost * (1 + (Number(r.pr) || 0) / 100) : (Number(r.rate) || 0) * Number(r.rate_exchange_rate || r.reference_exchange_rate || fx) / fx;
      const pr = r.pricing_mode === 'Percentage' ? Number(r.pr) || 0 : unitCost ? (rate / unitCost - 1) * 100 : 0;
      const gross = (Number(r.quantity) || 0) * rate;
      const discount = gross * (Number(r.item_discount_percent) || 0) / 100;
      return { ...r, base_cost_inr: cost * fx, reference_exchange_rate: fx, rate_exchange_rate: fx, production_cost: cost, rate, pr, gross_amount: gross,
        last_selling_price: Number(r.last_selling_price || 0) * referenceFx / fx,
        last_purchase_price: Number(r.last_purchase_price || 0) * referenceFx / fx,
        raw_material_cost: Number(r.raw_material_cost || 0) * referenceFx / fx,
        item_discount_amount: discount, amount: gross - discount, below_cost: rate * (1 - (Number(r.item_discount_percent) || 0) / 100) < unitCost ? 1 : 0 };
    });
    const subtotal = items.reduce((n, r) => n + r.amount, 0);
    const discount_amount = subtotal * (Number(v.discount_percent) || 0) / 100;
    const oldFx = Number(v.amount_exchange_rate || fx);
    const packing_charges = (Number(v.packing_charges) || 0) * oldFx / fx;
    const transport_charges = (Number(v.transport_charges) || 0) * oldFx / fx;
    const taxable_amount = subtotal - discount_amount + packing_charges + transport_charges;
    const tax_amount = taxable_amount * Number(v.gst_percent ?? 18) / 100;
    const state = ctx?.masters?.Customer?.[v.customer]?.state;
    const intra = !state || state.trim().toLowerCase() === (ctx.companyState || 'Gujarat').trim().toLowerCase();
    return { top: { ...(v.currency === 'INR' ? { exchange_rate: 1 } : {}), amount_exchange_rate: fx, packing_charges, transport_charges, subtotal, discount_amount, taxable_amount, tax_amount, grand_total: taxable_amount + tax_amount, total_amount: subtotal,
      cgst: intra ? tax_amount / 2 : 0, sgst: intra ? tax_amount / 2 : 0, igst: intra ? 0 : tax_amount, below_cost: items.some(r => r.below_cost) ? 1 : 0 }, rows: { items } };
  };
  const download = config.rowActions.find(a => a.key === 'download_pdf');
  download.run = async r => { await downloadQuotation(r); return 'PDF downloaded'; };
  config.columns.splice(3, 0, { field: 'currency', label: 'Currency' }, { field: 'valid_until', label: 'Valid until', type: 'date' }, { field: 'created_by_name', label: 'Created by' });
}

export const quotationMasters = {
  '/quotation-currency': { doctype: 'Quotation Currency', title: 'Currency', fields: [ { name: 'currency_code', label: 'Code (e.g. EUR)', type: 'text', required: true, readOnlyOnEdit: true }, { name: 'symbol', label: 'Symbol', type: 'text' }, { name: 'enabled', label: 'Enabled', type: 'check', default: () => 1 } ], columns: [{ field: 'currency_code', label: 'Code' }, { field: 'symbol', label: 'Symbol' }] },
  '/competitor-company': { doctype: 'Competitor Company', title: 'Competitor company', fields: [{ name: 'company_code', label: 'Company code', required: true, readOnlyOnEdit: true }, { name: 'company_name', label: 'Name', required: true }], columns: [{ field: 'company_code', label: 'Code' }, { field: 'company_name', label: 'Name' }] },
  '/product-code-mapping': { doctype: 'Product Code Mapping', title: 'Product code mapping', fields: [{ name: 'customer', label: 'Customer', type: 'link', master: 'Customer' }, link('competitor', 'Competitor', 'Competitor Company'), { name: 'external_code', label: 'External code', required: true }, { name: 'product', label: 'Surya product', type: 'link', master: 'Product', required: true }], columns: [{ field: 'external_code', label: 'External code' }, { field: 'customer', label: 'Customer' }, { field: 'competitor', label: 'Competitor' }, { field: 'product', label: 'Surya product' }] },
};
