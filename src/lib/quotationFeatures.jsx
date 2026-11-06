import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { call, getDoc, getList, runAction } from '../api/client';
import QuotationVersionBar, { openQuotation } from '../components/QuotationVersionBar';
import { todayISO } from '../lib/format';
import { useAuthStore } from '../stores/authStore';
import { db } from '../db/dexie';

const api = (name, args = {}) => call(`clssurya.utils.quotation_features.${name}`, args);
const number = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const read = (name, label, extra = {}) => ({ name, label, type: 'text', readOnly: true, ...extra });
const link = (name, label, doctype, extra = {}) => ({ name, label, type: 'link', doctype, ...extra });

export async function quotationPdf(doc) {
  if (!doc?.name) throw new Error('Save the quotation before downloading its PDF.');
  const result = await api('download_pdf', { name: doc.name });
  const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
  return new File([bytes], result.filename, { type: 'application/pdf' });
}

export async function downloadQuotation(doc) {
  const file = await quotationPdf(doc);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function shareQuotation(doc) {
  const file = await quotationPdf(doc);
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `Quotation ${doc.name}`,
      text: 'Please find the quotation attached.',
    });
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.alert(
      'The PDF has been downloaded. Open WhatsApp and attach this file to your customer conversation. Direct file sharing requires a browser with file sharing support.'
    );
  }
}

export function isQuotationExpired(doc) {
  if (!doc) return false;
  if (['Accepted', 'Superseded'].includes(doc.status)) return false;
  if (doc.status === 'Disapproved') return true;

  let validUntil = doc.valid_until;
  if (!validUntil && doc.quotation_date) {
    const days = Number(doc.validity_days) > 0 ? Number(doc.validity_days) : 15;
    const d = new Date(doc.quotation_date);
    d.setDate(d.getDate() + days);
    validUntil = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
  }
  if (!validUntil) return false;
  return String(validUntil) < todayISO();
}

export function getEffectiveQuotationStatus(doc) {
  if (!doc) return 'Draft';
  if (doc.status === 'Rejected') return 'Rejected';
  if (isQuotationExpired(doc)) return 'Disapproved';
  return doc.status || 'Draft';
}

function QuotationPanel({ doc, values }) {
  const creator = useAuthStore((state) => state.fullName);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const effectiveStatus = getEffectiveQuotationStatus(doc);
  const expired = isQuotationExpired(doc);

  return (
    <Stack spacing={1}>
      <QuotationVersionBar doc={doc} />
      <Typography component="div" variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <span>Created by: {doc?.created_by_name || doc?.owner || creator || 'Current user'}</span>
        <span>·</span>
        <span>Currency: {values.currency || 'INR'}</span>
        <span>·</span>
        <span>Valid until: {doc?.valid_until || values.valid_until || 'Calculated when saved'}</span>
        {doc?.status && (
          <Chip
            size="small"
            label={effectiveStatus}
            color={
              effectiveStatus === 'Disapproved' || effectiveStatus === 'Rejected'
                ? 'error'
                : effectiveStatus === 'Approved'
                ? 'info'
                : 'default'
            }
            sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
          />
        )}
        {expired && (
          <Typography component="span" variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>
            (Expired - Disapproved)
          </Typography>
        )}
      </Typography>
      <Typography variant="caption">
        References are in the selected currency, per product master unit. Quoted quantities and rates use the selected line unit. Enter master units per quoted unit for unit conversion. A percentage is undefined when the cost base is zero.
      </Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const prevList = await getList('Quotation', {
                fields: [
                  'name',
                  'customer',
                  'quotation_date',
                  'valid_until',
                  'validity_days',
                  'grand_total',
                  'status',
                  'version',
                ],
                orderBy: 'creation desc',
              });
              setDetail({
                title: values.customer
                  ? `Previously Created Quotations · ${values.customer}`
                  : 'Previously Created Quotations',
                rows: (prevList || [])
                  .filter((q) => !values.customer || q.customer === values.customer)
                  .map((q) => ({
                    quotation: q.name,
                    customer: q.customer,
                    date: q.quotation_date,
                    valid_until: q.valid_until || '—',
                    amount: q.grand_total,
                    status: getEffectiveQuotationStatus(q),
                    version: q.version ? `v${q.version}` : 'v1',
                  })),
              });
            })
          }
        >
          Previous Quotations
        </Button>
        {doc?.name && (
          <>
            <Button disabled={busy} onClick={() => run(() => downloadQuotation(doc))}>
              Download PDF
            </Button>
            <Button disabled={busy} onClick={() => run(() => shareQuotation(doc))}>
              WhatsApp / Share PDF
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const recipient = window.prompt('Customer email address');
                  if (recipient) {
                    await api('email_pdf', { name: doc.name, recipient });
                    window.alert('Quotation email queued.');
                  }
                })
              }
            >
              Email PDF
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setDetail({
                    title: 'Generated PDFs',
                    rows: await api('pdf_history', { name: doc.name }),
                  })
                )
              }
            >
              PDF history
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setDetail({
                    title: 'Quotation activity',
                    rows: (await api('activity', { name: doc.name })).map((log) => {
                      let data = {};
                      try {
                        data = JSON.parse(log.data);
                      } catch {}
                      return {
                        user: log.owner,
                        date: log.creation,
                        changes:
                          (data.changed || [])
                            .map(
                              (change) =>
                                `${change[0].replaceAll('_', ' ')}: ${change[1] ?? 'empty'} → ${change[2] ?? 'empty'}`
                            )
                            .join('; ') || 'Quotation items updated',
                      };
                    }),
                  })
                )
              }
            >
              Activity
            </Button>
            {['Draft', 'Sent', 'Approved'].includes(effectiveStatus) && (
              <Button
                color="error"
                variant="outlined"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (
                      !window.confirm(
                        `Reject quotation ${doc.name}? Rejection status will be maintained.`
                      )
                    )
                      return;
                    await runAction('Quotation', doc.name, 'reject');
                    window.location.reload();
                  })
                }
              >
                Reject Quotation
              </Button>
            )}
          </>
        )}
        <Button
          disabled={busy}
          onClick={() =>
            run(async () =>
              setDetail({
                title: 'My sales performance',
                rows: await api('performance'),
              })
            )
          }
        >
          Sales performance
        </Button>
        {(values.items || [])
          .filter((r) => r.product)
          .map((r, i) => (
            <Button
              key={`${r.product}-${i}`}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const info = await api('product_references', { product: r.product });
                  setDetail({
                    title: `${r.product} · History (INR / master unit)`,
                    rows: [
                      ...info.monthly_prices.map((p) => ({
                        month: p.month,
                        unit: p.uom,
                        average_selling_price: p.average,
                      })),
                      ...info.production_history,
                    ],
                  });
                })
              }
            >
              Price history: {r.product}
            </Button>
          ))}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="md">
        <DialogTitle>{detail?.title}</DialogTitle>
        <DialogContent>
          {!detail?.rows?.length && <Typography>No records yet.</Typography>}
          {!!detail?.rows?.length &&
            (detail.rows[0].file_url ? (
              detail.rows.map((r, i) => (
                <Box key={i} sx={{ py: 1 }}>
                  <a href={r.file_url} target="_blank" rel="noreferrer">
                    {r.file_name} · {r.creation}
                  </a>
                </Box>
              ))
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[...new Set(detail.rows.flatMap((row) => Object.keys(row)))].map((key) => (
                        <TableCell key={key}>{key.replaceAll('_', ' ')}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.rows.map((row, i) => (
                      <TableRow key={i}>
                        {[...new Set(detail.rows.flatMap((r) => Object.keys(r)))].map((key) => (
                          <TableCell key={key}>
                            {key === 'quotation' ? (
                              <Button
                                size="small"
                                variant="text"
                                sx={{ p: 0, minWidth: 0, fontWeight: 700 }}
                                onClick={() => openQuotation(row[key])}
                              >
                                {row[key]}
                              </Button>
                            ) : typeof row[key] === 'number' ? (
                              row[key].toLocaleString(undefined, { maximumFractionDigits: 4 })
                            ) : (
                              String(row[key] ?? '')
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

/**
 * Robust product info lookup:
 * - UOM from Product master / Dexie
 * - Cost unit from batch unit cost (clssurya.api.get_finished_cost -> Belt/PU Batch -> Inventory -> Product rate)
 * - Product image
 * - Last sale price from recent Sales Orders
 * - Last purchase price from recent Purchase Entries / Product doc
 * - BOM raw cost
 */
export async function fetchProductInfo(productName) {
  if (!productName) {
    return {
      uom: '',
      production_cost: 0,
      image: '',
      last_selling_price: 0,
      last_purchase_price: 0,
      raw_material_cost: 0,
    };
  }

  let uom = '';
  let cost = 0;
  let image = '';
  let lastSelling = 0;
  let lastPurchase = 0;
  let rawCost = 0;
  let doc = null;

  // 1. Try to get Product doc from Dexie
  try {
    if (typeof db !== 'undefined' && db?.table) {
      doc = await db.table('Product').get(productName);
      if (!doc) {
        const all = await db.table('Product').toArray();
        doc = all.find(
          (x) =>
            x.name === productName ||
            x.product_code === productName ||
            x.product_name === productName
        );
      }
    }
  } catch (_) {}

  // 2. Fallback to API getDoc
  if (!doc) {
    try {
      doc = await getDoc('Product', productName);
    } catch (_) {}
  }

  if (doc) {
    uom = doc.uom || '';
    image = doc.image || '';
    if (Number(doc.last_purchase_rate) > 0) lastPurchase = Number(doc.last_purchase_rate);
    if (Number(doc.valuation_rate) > 0) rawCost = Number(doc.valuation_rate);
    if (Number(doc.production_cost) > 0) cost = Number(doc.production_cost);
  }

  // 3. Try product_references backend endpoint if available (GET to avoid 417)
  try {
    const info = await call('clssurya.utils.quotation_features.product_references', { product: productName }, { get: true });
    if (info) {
      if (info.uom) uom = info.uom;
      if (info.image) image = info.image;
      if (Number(info.production_cost) > 0) cost = Number(info.production_cost);
      if (Number(info.last_selling_price) > 0) lastSelling = Number(info.last_selling_price);
      if (Number(info.last_purchase_price) > 0) lastPurchase = Number(info.last_purchase_price);
      if (Number(info.raw_material_cost) > 0) rawCost = Number(info.raw_material_cost);
    }
  } catch (_) {}

  const prodKeys = [productName, doc?.name, doc?.product_code, doc?.product_name].filter(Boolean);

  // 4. Batch Unit Cost lookup (user explicitly requested: "cost unit(fetch according batch unit cost)")
  try {
    const fc = await call('clssurya.api.get_finished_cost', {}, { get: true });
    if (fc) {
      const matchKey = prodKeys.find((k) => fc[k]?.unit_price > 0);
      if (matchKey) {
        cost = Number(fc[matchKey].unit_price);
      }
    }
  } catch (_) {}

  // Look up latest batch unit cost across Belt Batches and Stage Batches
  if (!cost) {
    // Check Belt Batch
    try {
      let beltBatches = [];
      if (typeof db !== 'undefined' && db?.table) {
        try {
          beltBatches = await db.table('Belt Batch').toArray();
        } catch (_) {}
      }
      if (!beltBatches?.length) {
        beltBatches = await getList('Belt Batch', {
          fields: ['name', 'product', 'unit_cost', 'batch_total', 'quantity', 'modified'],
          orderBy: 'modified desc',
          limit: 100,
        });
      }
      const match = (beltBatches || []).find(
        (b) =>
          prodKeys.includes(b.product) &&
          (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
      );
      if (match) {
        cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
      }
    } catch (_) {}

    // Check Stage 3 Batch
    if (!cost) {
      try {
        let stg3Batches = [];
        if (typeof db !== 'undefined' && db?.table) {
          try {
            stg3Batches = await db.table('Stage 3 Batch').toArray();
          } catch (_) {}
        }
        if (!stg3Batches?.length) {
          stg3Batches = await getList('Stage 3 Batch', {
            fields: ['name', 'product', 'unit_cost', 'batch_total', 'quantity', 'modified'],
            orderBy: 'modified desc',
            limit: 100,
          });
        }
        const match = (stg3Batches || []).find(
          (b) =>
            prodKeys.includes(b.product) &&
            (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
        );
        if (match) {
          cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
        }
      } catch (_) {}
    }

    // Check Stage 2 Batch
    if (!cost) {
      try {
        let stg2Batches = [];
        if (typeof db !== 'undefined' && db?.table) {
          try {
            stg2Batches = await db.table('Stage 2 Batch').toArray();
          } catch (_) {}
        }
        if (!stg2Batches?.length) {
          stg2Batches = await getList('Stage 2 Batch', {
            fields: ['name', 'product', 'unit_cost', 'batch_total', 'quantity', 'modified'],
            orderBy: 'modified desc',
            limit: 100,
          });
        }
        const match = (stg2Batches || []).find(
          (b) =>
            prodKeys.includes(b.product) &&
            (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
        );
        if (match) {
          cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
        }
      } catch (_) {}
    }

    // Check Inventory table (Finished stage)
    if (!cost) {
      try {
        if (typeof db !== 'undefined' && db?.table) {
          const invList = await db.table('Inventory').toArray();
          const match = (invList || []).find(
            (inv) =>
              prodKeys.includes(inv.product) &&
              Number(inv.unit_price) > 0 &&
              ['Finished', 'Stage 3', 'Stage 4'].includes(inv.stage)
          );
          if (match) {
            cost = Number(match.unit_price);
          }
        }
      } catch (_) {}
    }

    // Fallback to Product rates
    if (!cost && doc) {
      cost = Number(doc.valuation_rate || doc.standard_rate || doc.last_purchase_rate || doc.production_cost) || 0;
    }
  }

  // 5. Last selling price lookup (from recent Sales Orders)
  if (!lastSelling) {
    try {
      let soList = [];
      if (typeof db !== 'undefined' && db?.table) {
        try {
          soList = await db.table('Sales Order').toArray();
        } catch (_) {}
      }
      if (!soList?.length) {
        soList = await getList('Sales Order', {
          fields: ['name', 'items', 'modified'],
          orderBy: 'modified desc',
          limit: 50,
        });
      }
      for (const so of soList || []) {
        if (Array.isArray(so.items)) {
          const item = so.items.find((it) => prodKeys.includes(it.product) && Number(it.rate) > 0);
          if (item) {
            lastSelling = Number(item.rate);
            break;
          }
        }
      }
    } catch (_) {}
  }

  // 6. Last purchase price lookup (from recent Purchase Entries)
  if (!lastPurchase) {
    try {
      let peList = [];
      if (typeof db !== 'undefined' && db?.table) {
        try {
          peList = await db.table('Purchase Entry').toArray();
        } catch (_) {}
      }
      if (!peList?.length) {
        peList = await getList('Purchase Entry', {
          fields: ['name', 'items', 'modified'],
          orderBy: 'modified desc',
          limit: 50,
        });
      }
      for (const pe of peList || []) {
        if (Array.isArray(pe.items)) {
          const item = pe.items.find((it) => prodKeys.includes(it.product) && Number(it.rate) > 0);
          if (item) {
            lastPurchase = Number(item.rate);
            break;
          }
        }
      }
    } catch (_) {}
  }

  return {
    uom,
    production_cost: cost,
    image,
    last_selling_price: lastSelling,
    last_purchase_price: lastPurchase,
    raw_material_cost: rawCost,
  };
}

/**
 * Slim Previous / Next Quotation navigator shown in the DialogTitle right slot.
 * Uses the local Quotation list only — no backend navigation API needed.
 */
function QuotationNavButtons({ doc }) {
  const name = doc?.name;
  const [allList, setAllList] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let list = [];
        if (typeof db !== 'undefined' && db?.table) {
          try { list = await db.table('Quotation').toArray(); } catch (_) {}
        }
        if (!list?.length) {
          list = await getList('Quotation', {
            fields: ['name', 'creation'],
            orderBy: 'creation asc',
            limit: 500,
          });
        }
        if (alive && Array.isArray(list)) {
          const sorted = [...list].sort((a, b) =>
            String(a.creation || a.name).localeCompare(String(b.creation || b.name))
          );
          setAllList(sorted);
        }
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [name]);

  if (!name) return null;

  const idx = allList.findIndex((q) => q.name === name);
  const prevName = idx > 0 ? allList[idx - 1]?.name : (doc?.previous_version || doc?.parent_quotation || null);
  const nextName = (idx >= 0 && idx < allList.length - 1) ? allList[idx + 1]?.name : null;

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 'auto', flexShrink: 0 }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<ArrowBackIcon fontSize="small" />}
        disabled={!prevName}
        onClick={() => prevName && openQuotation(prevName)}
        sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }}
      >
        Previous
      </Button>
      <Button
        size="small"
        variant="outlined"
        endIcon={<ArrowForwardIcon fontSize="small" />}
        disabled={!nextName}
        onClick={() => nextName && openQuotation(nextName)}
        sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }}
      >
        Next
      </Button>
    </Box>
  );
}

export function recomputeLine(row) {
  const cost = Number(row.production_cost) || 0;
  const factor = Number(row.conversion_factor) || 1;
  const unitCost = cost * factor;
  const qty = Number(row.quantity) || 0;
  const discountPct = Number(row.item_discount_percent) || 0;
  const gstPct = row.gst_percent !== undefined && row.gst_percent !== '' ? Number(row.gst_percent) : 0;

  let rate = Number(row.rate) || 0;
  if (row.pricing_mode === 'Percentage' || row.pricing_mode === undefined) {
    const pr = Number(row.pr) || 0;
    // Only auto-calculate rate from cost when we have a real unit cost.
    // When cost is 0, keep whatever the user has already typed in the rate field.
    if (unitCost > 0) {
      rate = unitCost * (1 + pr / 100) * (1 + (gstPct || 0) / 100);
      row.rate = rate;
    }
    // else: leave row.rate as-is so manual entry survives a recompute
  } else if (unitCost > 0) {
    const baseRate = rate / (1 + (gstPct || 0) / 100);
    row.pr = ((baseRate / unitCost) - 1) * 100;
  }

  const gross = qty * rate;
  const discountAmt = (gross * discountPct) / 100;
  row.gross_amount = gross;
  row.item_discount_amount = discountAmt;
  row.amount = gross - discountAmt;
}

export async function setProduct(row) {
  if (!row.product) return;
  const product = row.product;
  const info = await fetchProductInfo(product);
  if (row.product !== product) return;

  row.image = info.image || '';
  row.uom = info.uom || '';
  row.production_cost = info.production_cost || 0;
  row.base_cost_inr = info.production_cost || 0;
  row.last_selling_price = info.last_selling_price || 0;
  row.last_purchase_price = info.last_purchase_price || 0;
  row.raw_material_cost = info.raw_material_cost || 0;
  row.conversion_factor = Number(row.conversion_factor) || 1;
  row.reference_exchange_rate = 1;
  row.pricing_mode = 'Percentage';

  recomputeLine(row);
}

export function enhanceQuotation(config) {
  config.getEffectiveStatus = getEffectiveQuotationStatus;
  config.isLocked = (d) =>
    ['Superseded', 'Accepted', 'Rejected', 'Disapproved'].includes(getEffectiveQuotationStatus(d));
  config.header = (values, doc) => <QuotationPanel values={values} doc={doc} />;
  config.fields.splice(
    2,
    0,
    number('validity_days', 'Validity (days)', { positive: true, default: () => 15 }),
    {
      name: 'currency',
      label: 'Currency',
      type: 'select',
      options: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'CAD', 'AUD'],
      default: () => 'INR',
      required: true,
      onChange: (values) => {
        values.exchange_rate = values.currency === 'INR' ? 1 : '';
      },
    },
    number('exchange_rate', 'Exchange rate (INR per currency unit)', { positive: true, required: true }),
    { name: 'remarks', label: 'Remarks', type: 'textarea' }
  );

  // Set line items fields strictly in the user-requested sequence:
  // product img, product, uom (fetch according product select), cost unit(fetch according batch unit cost),
  // qty, pr, rate, gst, discount, amount, last sale, last purchase, bom raw cost
  config.tables[0].itemDiscounts = false;
  config.tables[0].fields = [
    {
      name: 'image',
      label: 'Product img',
      type: 'image',
      readOnly: true,
    },
    {
      name: 'product',
      label: 'Product',
      type: 'link',
      master: 'Product',
      required: true,
      minWidth: 220,
      labelField: 'product_name',
      onChange: async (row) => {
        await setProduct(row);
      },
    },
    {
      name: 'uom',
      label: 'UOM',
      type: 'link',
      master: 'UOM',
      required: true,
      minWidth: 90,
    },
    {
      ...read('production_cost', 'Cost unit'),
      type: 'currency',
      dp: 4,
      minWidth: 100,
    },
    number('quantity', 'Qty', {
      positive: true,
      required: true,
      minWidth: 80,
      onChange: (row) => {
        recomputeLine(row);
      },
    }),
    number('pr', 'PR (%)', {
      allowNegative: true,
      dp: 2,
      default: () => 0,
      minWidth: 80,
      onChange: (row) => {
        row.pricing_mode = 'Percentage';
        recomputeLine(row);
      },
    }),
    {
      name: 'rate',
      label: 'Rate',
      type: 'currency',
      dp: 4,
      minWidth: 105,
      readOnly: false,
      onChange: (row, { values } = {}) => {
        row.pricing_mode = 'Rate';
        row.rate_exchange_rate = values?.currency === 'INR' ? 1 : Number(values?.exchange_rate) || 1;
        recomputeLine(row);
      },
    },
    number('gst_percent', 'GST (%)', {
      min: 0,
      max: 100,
      default: () => 0,
      minWidth: 80,
      onChange: (row) => {
        recomputeLine(row);
      },
    }),
    number('item_discount_percent', 'Discount (%)', {
      min: 0,
      max: 100,
      default: () => 0,
      minWidth: 90,
      onChange: (row) => {
        recomputeLine(row);
      },
    }),
    {
      ...read('amount', 'Amount'),
      type: 'currency',
      dp: 2,
      minWidth: 110,
    },
    {
      ...read('last_selling_price', 'Last sale'),
      type: 'currency',
      minWidth: 100,
    },
    {
      ...read('last_purchase_price', 'Last purchase'),
      type: 'currency',
      minWidth: 100,
    },
    {
      ...read('raw_material_cost', 'BOM raw cost'),
      type: 'currency',
      minWidth: 110,
    },
  ];

  config.tables[0].newRow = () => ({
    quantity: 1,
    pr: 0,
    gst_percent: 0,
    item_discount_percent: 0,
    pricing_mode: 'Percentage',
    conversion_factor: 1,
  });

  /**
   * Called by DocForm when opening a saved quotation.
   * Re-fetches product info for any row where production_cost is missing or 0,
   * so cost unit always shows correctly after "Save as Draft" → reopen.
   */
  config.fixItems = async (items) => {
    const fixed = await Promise.all(
      items.map(async (row) => {
        if (!row.product) return row;
        // If we already have a valid cost, skip the fetch
        if (Number(row.production_cost) > 0 || Number(row.base_cost_inr) > 0) return row;
        try {
          const info = await fetchProductInfo(row.product);
          if (info.production_cost > 0) {
            const updated = {
              ...row,
              uom: row.uom || info.uom || '',
              image: row.image || info.image || '',
              production_cost: info.production_cost,
              base_cost_inr: info.production_cost,
              last_selling_price: row.last_selling_price || info.last_selling_price || 0,
              last_purchase_price: row.last_purchase_price || info.last_purchase_price || 0,
              raw_material_cost: row.raw_material_cost || info.raw_material_cost || 0,
            };
            // Recalculate rate if in Percentage mode
            if ((updated.pricing_mode === 'Percentage' || !updated.pricing_mode) && !Number(row.rate)) {
              recomputeLine(updated);
            }
            return updated;
          }
        } catch (_) {}
        return row;
      })
    );
    return fixed;
  };

  config.compute = (v, ctx) => {
    const qDateStr = v.quotation_date || todayISO();
    const qDate = new Date(qDateStr);
    const validityDays = Number(v.validity_days) > 0 ? Number(v.validity_days) : 15;
    const validDate = new Date(qDate);
    validDate.setDate(validDate.getDate() + validityDays);
    const valid_until = !isNaN(validDate.getTime()) ? validDate.toISOString().split('T')[0] : '';
    const fx = v.currency === 'INR' ? 1 : Number(v.exchange_rate) || 1;

    const items = (v.items || []).map((r) => {
      const referenceFx = Number(r.reference_exchange_rate || fx);
      const cost =
        (r.base_cost_inr != null && Number(r.base_cost_inr) > 0
          ? Number(r.base_cost_inr)
          : (Number(r.production_cost) || 0) * referenceFx) / fx;
      const unitCost = cost * (Number(r.conversion_factor) || 1);
      const lineGstPct = Number(r.gst_percent ?? 0);
      // When pricing_mode is Percentage and we have a unit cost, derive rate from cost+PR.
      // When cost is 0, preserve whatever rate the user has typed (don't overwrite with 0).
      const existingRate = Number(r.rate) || 0;
      const calculatedRate = unitCost > 0
        ? unitCost * (1 + (Number(r.pr) || 0) / 100) * (1 + (lineGstPct || 0) / 100)
        : existingRate;
      const rate =
        r.pricing_mode === 'Rate'
          ? (existingRate) * Number(r.rate_exchange_rate || r.reference_exchange_rate || fx) / fx
          : calculatedRate;
      const pr =
        r.pricing_mode === 'Rate'
          ? (unitCost ? (((rate / (1 + (lineGstPct || 0) / 100)) / unitCost) - 1) * 100 : Number(r.pr) || 0)
          : Number(r.pr) || 0;
      const gross = (Number(r.quantity) || 0) * rate;
      const discount = (gross * (Number(r.item_discount_percent) || 0)) / 100;
      const amount = gross - discount;
      const taxableLine = amount / (1 + (lineGstPct || 0) / 100);
      const lineTax = amount - taxableLine;

      return {
        ...r,
        base_cost_inr: cost * fx,
        reference_exchange_rate: fx,
        rate_exchange_rate: fx,
        production_cost: cost,
        rate,
        pr,
        gross_amount: gross,
        gst_percent: lineGstPct,
        gst_amount: lineTax,
        taxable_amount: taxableLine,
        last_selling_price: (Number(r.last_selling_price || 0) * referenceFx) / fx,
        last_purchase_price: (Number(r.last_purchase_price || 0) * referenceFx) / fx,
        raw_material_cost: (Number(r.raw_material_cost || 0) * referenceFx) / fx,
        item_discount_amount: discount,
        amount,
        below_cost:
          (rate / (1 + (lineGstPct || 0) / 100)) * (1 - (Number(r.item_discount_percent) || 0) / 100) < unitCost ? 1 : 0,
      };
    });

    const subtotal = items.reduce((n, r) => n + r.amount, 0);
    const discount_percent = Number(v.discount_percent) || 0;
    const discount_amount = (subtotal * discount_percent) / 100;
    const oldFx = Number(v.amount_exchange_rate || fx);
    const packing_charges = ((Number(v.packing_charges) || 0) * oldFx) / fx;
    const transport_charges = ((Number(v.transport_charges) || 0) * oldFx) / fx;
    const chargesTaxable = packing_charges + transport_charges;
    const overallGstPct = Number(v.gst_percent ?? 0);
    const chargesTax = (chargesTaxable * overallGstPct) / 100;
    const itemsTax = items.reduce((s, r) => s + (r.gst_amount || 0), 0) * (1 - discount_percent / 100);
    const tax_amount = itemsTax + chargesTax;
    const grand_total = Math.max(0, subtotal - discount_amount) + chargesTaxable + chargesTax;
    const taxable_amount = grand_total - tax_amount;
    const state = ctx?.masters?.Customer?.[v.customer]?.state;
    const intra =
      !state || state.trim().toLowerCase() === (ctx.companyState || 'Gujarat').trim().toLowerCase();

    return {
      top: {
        ...(v.currency === 'INR' ? { exchange_rate: 1 } : {}),
        valid_until,
        amount_exchange_rate: fx,
        packing_charges,
        transport_charges,
        subtotal,
        discount_amount,
        taxable_amount,
        tax_amount,
        grand_total,
        total_amount: subtotal,
        cgst: intra ? tax_amount / 2 : 0,
        sgst: intra ? tax_amount / 2 : 0,
        igst: intra ? 0 : tax_amount,
        below_cost: items.some((r) => r.below_cost) ? 1 : 0,
      },
      rows: { items },
    };
  };

  config.beforeSave = (doc) => {
    // 1. Currency
    if (!doc.currency) {
      doc.currency = 'INR';
    }

    // 2. Validity
    if (!doc.validity_days) {
      doc.validity_days = 15;
    }
    if (!doc.valid_until && doc.quotation_date) {
      const days = Number(doc.validity_days) > 0 ? Number(doc.validity_days) : 15;
      const d = new Date(doc.quotation_date);
      d.setDate(d.getDate() + days);
      doc.valid_until = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    }
    doc.valid_till = doc.valid_until;

    // 3. Subtotal & Grand Total mapping (handles custom and standard Frappe DocType fields)
    const items = (doc.items || []).map((r) => {
      const qty = Number(r.quantity || r.qty) || 0;
      const rate = Number(r.rate) || 0;
      const discount = Number(r.item_discount_percent) || 0;
      const amt = Number(r.amount) || (qty * rate * (1 - discount / 100));
      const productionCost = Number(r.production_cost) || 0;
      const baseCostInr = Number(r.base_cost_inr) || productionCost;
      return { ...r, quantity: qty, rate, amount: amt, production_cost: productionCost, base_cost_inr: baseCostInr };
    });
    doc.items = items;

    const subtotal = Number(doc.subtotal) || items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const discountPct = Number(doc.discount_percent) || 0;
    const discountAmt = (subtotal * discountPct) / 100;
    const packing = Number(doc.packing_charges) || 0;
    const transport = Number(doc.transport_charges) || 0;
    const chargesTaxable = packing + transport;
    const overallGst = Number(doc.gst_percent ?? 0);
    const chargesGst = (chargesTaxable * overallGst) / 100;
    const itemsGst = items.reduce((s, r) => {
      const gstPct = Number(r.gst_percent) || 0;
      const taxLine = (Number(r.amount) || 0) * (gstPct / (100 + gstPct));
      return s + taxLine;
    }, 0) * (1 - discountPct / 100);
    const taxAmt = itemsGst + chargesGst;
    const grandTotal = Number(doc.grand_total) || (Math.max(0, subtotal - discountAmt) + chargesTaxable + chargesGst);

    doc.subtotal = subtotal;
    doc.total = subtotal;
    doc.net_total = subtotal;
    doc.base_total = subtotal;
    doc.base_net_total = subtotal;

    doc.tax_amount = taxAmt;
    doc.grand_total = grandTotal;
    doc.rounded_total = grandTotal;
    doc.base_grand_total = grandTotal;
    doc.base_rounded_total = grandTotal;

    return doc;
  };

  const download = config.rowActions.find((a) => a.key === 'download_pdf');
  if (download) {
    download.run = async (r) => {
      await downloadQuotation(r);
      return 'PDF downloaded';
    };
  }

  // Remove existing injected columns if any to avoid duplicates
  ['currency', 'valid_until', 'created_by_name'].forEach((f) => {
    const idx = config.columns.findIndex((c) => c.field === f);
    if (idx !== -1) config.columns.splice(idx, 1);
  });

  config.columns.splice(
    3,
    0,
    {
      field: 'currency',
      label: 'Currency',
      getValue: (row) => row.currency || 'INR',
    },
    {
      field: 'valid_until',
      label: 'Valid until',
      type: 'date',
      getValue: (row) => {
        if (row.valid_until) return row.valid_until;
        if (row.valid_till) return row.valid_till;
        if (row.quotation_date) {
          const days = Number(row.validity_days) > 0 ? Number(row.validity_days) : 15;
          const d = new Date(row.quotation_date);
          d.setDate(d.getDate() + days);
          return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
        }
        return '';
      },
    },
    {
      field: 'created_by_name',
      label: 'Created by',
      getValue: (row) => row.created_by_name || row.owner || '',
    }
  );

  const subtotalCol = config.columns.find((c) => c.field === 'subtotal');
  if (subtotalCol) {
    subtotalCol.getValue = (row) => {
      const val = row.subtotal ?? row.net_total ?? row.total ?? row.base_net_total ?? row.base_total ?? row.grand_total;
      if (val != null && val !== '') return Number(val);
      if (Array.isArray(row.items) && row.items.length) {
        return row.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }
      return 0;
    };
  }

  const grandTotalCol = config.columns.find((c) => c.field === 'grand_total');
  if (grandTotalCol) {
    grandTotalCol.getValue = (row) => {
      const val = row.grand_total ?? row.rounded_total ?? row.base_grand_total ?? row.base_rounded_total ?? row.total ?? row.subtotal;
      if (val != null && val !== '') return Number(val);
      if (Array.isArray(row.items) && row.items.length) {
        return row.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }
      return 0;
    };
  }

  const statusCol = config.columns.find((c) => c.field === 'status');
  if (statusCol) {
    statusCol.getValue = (row) => getEffectiveQuotationStatus(row);
  }
}

export const quotationMasters = {
  '/quotation-currency': {
    doctype: 'Quotation Currency',
    title: 'Currency',
    fields: [
      { name: 'currency_code', label: 'Code (e.g. EUR)', type: 'text', required: true, readOnlyOnEdit: true },
      { name: 'symbol', label: 'Symbol', type: 'text' },
      { name: 'enabled', label: 'Enabled', type: 'check', default: () => 1 },
    ],
    columns: [
      { field: 'currency_code', label: 'Code' },
      { field: 'symbol', label: 'Symbol' },
    ],
  },
  '/competitor-company': {
    doctype: 'Competitor Company',
    title: 'Competitor company',
    fields: [
      { name: 'company_code', label: 'Company code', required: true, readOnlyOnEdit: true },
      { name: 'company_name', label: 'Name', required: true },
    ],
    columns: [
      { field: 'company_code', label: 'Code' },
      { field: 'company_name', label: 'Name' },
    ],
  },
  '/product-code-mapping': {
    doctype: 'Product Code Mapping',
    title: 'Product code mapping',
    fields: [
      { name: 'customer', label: 'Customer', type: 'link', master: 'Customer' },
      link('competitor', 'Competitor', 'Competitor Company'),
      { name: 'external_code', label: 'External code', required: true },
      { name: 'product', label: 'Surya product', type: 'link', master: 'Product', required: true },
    ],
    columns: [
      { field: 'external_code', label: 'External code' },
      { field: 'customer', label: 'Customer' },
      { field: 'competitor', label: 'Competitor' },
      { field: 'product', label: 'Surya product' },
    ],
  },
};
