import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
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
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { call, getDoc, getList, runAction } from '../../api/client';
import QuotationVersionBar, { openQuotation } from './QuotationVersionBar';
import { generateQuotationPDF } from '../../lib/pdfUtils';
import { todayISO } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { db } from '../../db/dexie';

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
  try {
    await generateQuotationPDF(doc);
  } catch (clientErr) {
    console.warn('Client PDF generation fallback to server:', clientErr);
    const file = await quotationPdf(doc);
    downloadPdfFile(file);
  }
}

function downloadPdfFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
  const [shareFile, setShareFile] = useState(null);
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const shareData = shareFile ? { files: [shareFile] } : null;
  const canShareFile = !!(shareData && navigator.share && navigator.canShare?.(shareData));

  const prepareShare = async () => {
    setShareError('');
    setShareFile(await quotationPdf(doc));
  };

  const sharePdf = async () => {
    setSharing(true);
    setShareError('');
    try {
      await navigator.share(shareData);
      setShareFile(null);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setShareError('File sharing failed. Download the PDF and attach it in WhatsApp.');
      }
    } finally {
      setSharing(false);
    }
  };
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

  const uniqueProducts = [...new Set((values?.items || []).map((r) => r.product).filter(Boolean))];

  return (
    <>
      <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 1.5,
        borderRadius: '12px',
        bgcolor: '#ffffff',
        borderColor: '#e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <Stack spacing={1.25}>
        {/* Row 1: Version, Revise, Metadata, Navigation */}
        <QuotationVersionBar doc={doc} values={values} />

        <Divider sx={{ borderColor: '#f1f5f9' }} />

        {/* Row 2: Action Buttons */}
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          {doc?.name && (
            <>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<DownloadRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => run(() => downloadQuotation(doc))}
                sx={{
                  textTransform: 'none',
                  borderRadius: '7px',
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#0284c7',
                  borderColor: '#bae6fd',
                  bgcolor: '#f0f9ff',
                  '&:hover': { bgcolor: '#e0f2fe', borderColor: '#7dd3fc' },
                }}
              >
                Download PDF
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<ShareRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => run(prepareShare)}
                sx={{
                  textTransform: 'none',
                  borderRadius: '7px',
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#16a34a',
                  borderColor: '#bbf7d0',
                  bgcolor: '#f0fdf4',
                  '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                }}
              >
                WhatsApp / Share PDF
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<EmailOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() =>
                  run(async () => {
                    const recipient = window.prompt('Customer email address:');
                    if (recipient && recipient.trim()) {
                      try {
                        await api('email_pdf', { name: doc.name, recipient: recipient.trim() });
                        window.alert(`Quotation ${doc.name} email sent/queued to ${recipient.trim()}.`);
                      } catch (err) {
                        const msg = err?.message || String(err);
                        if (msg.includes('Email Account') || msg.includes('OutgoingEmailError')) {
                          window.alert('Outgoing Email Account is not yet configured in Frappe.\nPlease setup a default outgoing Email Account from Tools / Settings > Email Account in Frappe Desk.');
                        } else {
                          window.alert(`Could not send email: ${msg}`);
                        }
                      }
                    }
                  })
                }
                sx={{
                  textTransform: 'none',
                  borderRadius: '7px',
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569',
                  borderColor: '#cbd5e1',
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
                }}
              >
                Email PDF
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<HistoryEduOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() =>
                  run(async () =>
                    setDetail({
                      title: 'Generated PDFs',
                      rows: await api('pdf_history', { name: doc.name }),
                    })
                  )
                }
                sx={{
                  textTransform: 'none',
                  borderRadius: '7px',
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569',
                  borderColor: '#cbd5e1',
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
                }}
              >
                PDF history
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<HistoryRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() =>
                  run(async () =>
                    setDetail({
                      title: 'Quotation activity',
                      rows: (await api('activity', { name: doc.name })).map((log) => {
                        let data = {};
                        try {
                          data = JSON.parse(log.data);
                        } catch { }
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
                sx={{
                  textTransform: 'none',
                  borderRadius: '7px',
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569',
                  borderColor: '#cbd5e1',
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
                }}
              >
                Activity
              </Button>
              {['Draft', 'Sent', 'Approved'].includes(effectiveStatus) && (
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  disabled={busy}
                  startIcon={<CancelOutlinedIcon sx={{ fontSize: 16 }} />}
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
                  sx={{
                    textTransform: 'none',
                    borderRadius: '7px',
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  Reject Quotation
                </Button>
              )}
            </>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            startIcon={<TrendingUpRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() =>
              run(async () =>
                setDetail({
                  title: 'My sales performance',
                  rows: await api('performance'),
                })
              )
            }
            sx={{
              textTransform: 'none',
              borderRadius: '7px',
              height: 28,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#475569',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            Sales performance
          </Button>

          {uniqueProducts.map((prod) => (
            <Button
              key={prod}
              size="small"
              variant="outlined"
              disabled={busy}
              startIcon={<ShowChartRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={() =>
                run(async () => {
                  const info = await api('product_references', { product: prod });
                  setDetail({
                    title: `${prod} · History (INR / master unit)`,
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
              sx={{
                textTransform: 'none',
                borderRadius: '7px',
                height: 28,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0d9488',
                borderColor: '#99f6e4',
                bgcolor: '#f0fdfa',
                '&:hover': { bgcolor: '#ccfbf1', borderColor: '#5eead4' },
              }}
            >
              Price history: {prod}
            </Button>
          ))}
        </Stack>

        {/* Row 3: Info disclaimer note */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            bgcolor: '#f8fafc',
            px: 1.25,
            py: 0.6,
            borderRadius: '6px',
            border: '1px solid #f1f5f9',
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.72rem', lineHeight: 1.3 }}>
            References are in {values?.currency || 'INR'} per product master unit. Quoted quantities and rates use the selected line unit. Enter master units per quoted unit for unit conversion.
          </Typography>
        </Box>
      </Stack>
    </Paper>
      <Dialog open={!!shareFile} onClose={() => !sharing && setShareFile(null)} aria-labelledby="share-quotation-title">
        <DialogTitle id="share-quotation-title">Share quotation PDF</DialogTitle>
        <DialogContent>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{shareFile?.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {canShareFile
              ? 'Select WhatsApp in the share menu if available.'
              : 'Download the PDF and attach it as a document in WhatsApp.'}
          </Typography>
          {shareError && <Alert severity="warning" sx={{ mt: 1 }}>{shareError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={sharing} onClick={() => setShareFile(null)}>Close</Button>
          <Button disabled={sharing} onClick={() => downloadPdfFile(shareFile)}>Download PDF</Button>
          {canShareFile && <Button variant="contained" disabled={sharing} onClick={sharePdf}>Share PDF</Button>}
        </DialogActions>
      </Dialog>
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
    </>
  );
}

/**
 * Robust product info lookup:
 * - UOM from Product master / Dexie
 * - Cost unit from batch unit cost (clssurya.api.get_finished_cost -> Belt/PU Batch -> Inventory -> Product rate)
 * - Product image
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
  } catch (_) { }

  // 2. Fallback to API getDoc if not found or if image/metadata is missing
  if (!doc || !doc.image || !doc.company_code || !doc.competitor_company_code) {
    try {
      const serverDoc = await getDoc('Product', doc?.name || productName);
      if (serverDoc) {
        doc = { ...(doc || {}), ...serverDoc };
        if (serverDoc.image) image = serverDoc.image;
        if (typeof db !== 'undefined' && db?.table && doc.name) {
          try { await db.table('Product').put(doc); } catch (_) {}
        }
      }
    } catch (_) { }
  }

  if (doc) {
    uom = doc.uom || '';
    image = doc.image || image || '';
    if (Number(doc.last_purchase_rate) > 0) lastPurchase = Number(doc.last_purchase_rate);
    if (Number(doc.valuation_rate) > 0) rawCost = Number(doc.valuation_rate);
    if (Number(doc.production_cost) > 0) cost = Number(doc.production_cost);
  }

  if (!image) image = await fetchProductImage(productName);

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
  } catch (_) { }

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
  } catch (_) { }

  // Look up latest batch unit cost across Belt Batches and Stage Batches
  if (!cost) {
    // Check Belt Batch
    try {
      let beltBatches = [];
      if (typeof db !== 'undefined' && db?.table) {
        try {
          beltBatches = await db.table('Belt Batch').toArray();
        } catch (_) { }
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
    } catch (_) { }

    // Check Stage 3 Batch
    if (!cost) {
      try {
        let stg3Batches = [];
        if (typeof db !== 'undefined' && db?.table) {
          try {
            stg3Batches = await db.table('Stage 3 Batch').toArray();
          } catch (_) { }
        }
        if (!stg3Batches?.length) {
          stg3Batches = await getList('Stage 3 Batch', {
            fields: ['name', 'product', 'production_code', 'unit_cost', 'batch_total', 'quantity', 'modified'],
            orderBy: 'modified desc',
            limit: 100,
          });
        }
        const match = (stg3Batches || []).find(
          (b) =>
            (prodKeys.includes(b.product) || prodKeys.includes(b.production_code)) &&
            (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
        );
        if (match) {
          cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
        }
      } catch (_) { }
    }

    // Check Stage 2 Batch
    if (!cost) {
      try {
        let stg2Batches = [];
        if (typeof db !== 'undefined' && db?.table) {
          try {
            stg2Batches = await db.table('Stage 2 Batch').toArray();
          } catch (_) { }
        }
        if (!stg2Batches?.length) {
          stg2Batches = await getList('Stage 2 Batch', {
            fields: ['name', 'product', 'production_code', 'unit_cost', 'batch_total', 'quantity', 'modified'],
            orderBy: 'modified desc',
            limit: 100,
          });
        }
        const match = (stg2Batches || []).find(
          (b) =>
            (prodKeys.includes(b.product) || prodKeys.includes(b.production_code)) &&
            (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
        );
        if (match) {
          cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
        }
      } catch (_) { }
    }

    // Check Stage 1 Batch
    if (!cost) {
      try {
        let stg1Batches = [];
        if (typeof db !== 'undefined' && db?.table) {
          try {
            stg1Batches = await db.table('Stage 1 Batch').toArray();
          } catch (_) { }
        }
        if (!stg1Batches?.length) {
          stg1Batches = await getList('Stage 1 Batch', {
            fields: ['name', 'product', 'production_code', 'unit_cost', 'batch_total', 'quantity', 'modified'],
            orderBy: 'modified desc',
            limit: 100,
          });
        }
        const match = (stg1Batches || []).find(
          (b) =>
            (prodKeys.includes(b.product) || prodKeys.includes(b.production_code)) &&
            (Number(b.unit_cost) > 0 || (Number(b.quantity) > 0 && Number(b.batch_total) > 0))
        );
        if (match) {
          cost = Number(match.unit_cost) || Number(match.batch_total) / Number(match.quantity);
        }
      } catch (_) { }
    }

    // Check BOM standard calculation fallback
    if (!cost) {
      try {
        const bom = await getDoc('BOM', productName).catch(() => null);
        if (bom) {
          let s1 = 0, s2 = 0, s3 = 0;
          (bom.stage1_items || []).forEach((it) => { s1 += (Number(it.per_unit_utilization) || 0) * (Number(it.unit_price) || 0); });
          (bom.stage2_items || []).forEach((it) => { s2 += (Number(it.per_unit_utilization) || 0) * (Number(it.unit_price) || 0); });
          (bom.stage3_charges || []).forEach((c) => { s3 += Number(c.per_unit_price) || 0; });
          cost = (s1 + s2) * 1.1 + s3;
        }
      } catch (_) { }
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
      } catch (_) { }
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
        } catch (_) { }
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
    } catch (_) { }
  }

  // 6. Last purchase price lookup (from recent Purchase Entries)
  if (!lastPurchase) {
    try {
      let peList = [];
      if (typeof db !== 'undefined' && db?.table) {
        try {
          peList = await db.table('Purchase Entry').toArray();
        } catch (_) { }
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
    } catch (_) { }
  }

  return {
    uom,
    production_cost: cost,
    image,
    last_selling_price: lastSelling,
    last_purchase_price: lastPurchase,
    raw_material_cost: rawCost,
    // Product metadata for quotation columns
    product_code: doc?.product_code || productName || '',
    production_code: doc?.production_code || '',
    company_code: doc?.company_code || '',
    competitor_company: doc?.competitor_company || '',
    competitor_company_code: doc?.competitor_company_code || '',
  };
}

async function fetchProductImage(productName) {
  if (!productName) return '';
  try {
    if (typeof db !== 'undefined' && db?.table) {
      let p = await db.table('Product').get(productName);
      if (!p) {
        const all = await db.table('Product').toArray();
        p = all.find(
          (x) =>
            x.name === productName ||
            x.product_code === productName ||
            x.product_name === productName
        );
      }
      if (p?.image) return p.image;
    }
  } catch (_) {}
  try {
    const product = await getDoc('Product', productName);
    return product?.image || '';
  } catch (_) {
    return '';
  }
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
          try { list = await db.table('Quotation').toArray(); } catch (_) { }
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
      } catch (_) { }
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
    // When cost is 0, keep whatever the user has already typed in the rate field, or default to last_selling_price.
    if (unitCost > 0) {
      rate = unitCost * (1 + pr / 100) * (1 + (gstPct || 0) / 100);
      row.rate = rate;
    } else if (!rate && Number(row.last_selling_price) > 0) {
      rate = Number(row.last_selling_price);
      row.rate = rate;
    }
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

export async function setProduct(row, { values } = {}) {
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

  // Set product metadata columns (product_code, production_code, company_code, competitor_company, competitor_company_code)
  if (info.product_code) row.product_code = info.product_code;
  if (info.production_code !== undefined) row.production_code = info.production_code || '';
  if (info.company_code !== undefined) row.company_code = info.company_code || '';
  if (info.competitor_company !== undefined) row.competitor_company = info.competitor_company || '';
  if (info.competitor_company_code !== undefined) row.competitor_company_code = info.competitor_company_code || '';

  // Fetch customer-wise last selling price (or product fallback)
  const customer = row._customer || values?.customer;
  if (product) {
    try {
      const priceResult = await call('clssurya.api.get_last_selling_price', { customer: customer || undefined, product }, { get: true });
      if (priceResult && priceResult.has_history && Number(priceResult.last_selling_price) > 0) {
        row.last_selling_price = Number(priceResult.last_selling_price);
        row._last_selling_price_ref = priceResult.source_ref || '';
        row._last_selling_price_date = priceResult.transaction_date || '';
      } else if (info.last_selling_price > 0) {
        row.last_selling_price = info.last_selling_price;
      }
    } catch (_) {
      if (info.last_selling_price > 0) row.last_selling_price = info.last_selling_price;
    }
  }

  recomputeLine(row);
}

export function enhanceQuotation(config) {
  config.getEffectiveStatus = getEffectiveQuotationStatus;
  const prevDefaults = config.newDefaults;
  config.newDefaults = () => ({
    ...(prevDefaults ? prevDefaults() : {}),
    currency: 'INR',
    exchange_rate: 1,
    validity_days: 15,
  });
  config.isLocked = (d) =>
    ['Superseded', 'Accepted', 'Rejected', 'Disapproved'].includes(getEffectiveQuotationStatus(d));
  config.header = (values, doc) => <QuotationPanel values={values} doc={doc} />;
  config.fields.splice(
    2,
    0,
    number('validity_days', 'Validity (days)', { positive: true, default: () => 15 }),
    link('currency', 'Currency', 'Currency', {
      master: 'Currency',
      required: true,
      default: () => 'INR',
      onChange: (rowOrVals, ctx) => {
        const val = typeof rowOrVals === 'string' ? rowOrVals : (rowOrVals?.currency || ctx?.values?.currency);
        const ex = (val === 'INR' || val === 'Indian Rupee') ? 1 : '';
        if (rowOrVals && typeof rowOrVals === 'object') {
          rowOrVals.exchange_rate = ex;
        }
        if (ctx?.setValue) {
          ctx.setValue('exchange_rate', ex, { shouldDirty: true });
        }
      },
    }),
    number('exchange_rate', 'Exchange rate (INR per currency unit)', { positive: true, required: true }),
    { name: 'remarks', label: 'Remarks', type: 'textarea' }
  );

  // Set line items fields strictly in the user-requested sequence:
  // product img, product, uom (fetch according product select), cost unit(fetch according batch unit cost),
  // qty, pr, rate, gst, discount, amount
  config.tables[0].itemDiscounts = false;
  config.tables[0].fields = [
    {
      name: 'image',
      label: 'Img',
      type: 'image',
      readOnly: true,
      minWidth: 36,
    },
    {
      name: 'product',
      label: 'Product',
      type: 'link',
      master: 'Product',
      required: true,
      minWidth: 180,
      labelField: 'product_name',
      onChange: async (row, ctx) => {
        await setProduct(row, ctx);
      },
    },
    {
      ...read('product_code', 'Product Code'),
      minWidth: 75,
    },
    {
      ...read('production_code', 'Prod. Code'),
      minWidth: 70,
    },
    {
      ...read('company_code', 'Co. Code'),
      minWidth: 65,
    },
    {
      ...read('competitor_company', 'Comp. Co.'),
      minWidth: 70,
    },
    {
      ...read('competitor_company_code', 'Comp. Code'),
      minWidth: 70,
    },
    {
      name: 'uom',
      label: 'UOM',
      type: 'link',
      master: 'UOM',
      required: true,
      minWidth: 10,
    },
    {
      ...read('production_cost', 'Cost unit'),
      type: 'currency',
      dp: 4,
      minWidth: 50,
    },
    number('quantity', 'Qty', {
      positive: true,
      required: true,
      minWidth: 40,
      onChange: (row) => {
        recomputeLine(row);
      },
    }),
    number('pr', 'PR (%)', {
      allowNegative: true,
      dp: 2,
      default: () => 0,
      minWidth: 40,
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
      minWidth: 70,
      readOnly: false,
      onChange: (row, { values } = {}) => {
        row.pricing_mode = 'Rate';
        row.rate_exchange_rate = (values?.currency === 'INR' || values?.currency === 'Indian Rupee') ? 1 : Number(values?.exchange_rate) || 1;
        recomputeLine(row);
      },
    },
    // number('gst_percent', 'GST(%)', {
    //   min: 0,
    //   max: 100,
    //   default: () => 0,
    //   minWidth: 40,
    //   onChange: (row) => {
    //     recomputeLine(row);
    //   },
    // }),
    number('item_discount_percent', 'Discount(%)', {
      min: 0,
      max: 100,
      default: () => 0,
      minWidth: 50,
      onChange: (row) => {
        recomputeLine(row);
      },
    }),
    {
      ...read('last_selling_price', 'Last Sold'),
      type: 'currency',
      dp: 2,
      minWidth: 60,
    },
    {
      ...read('amount', 'Amount'),
      type: 'currency',
      dp: 2,
      minWidth: 50,
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
   * so cost unit always shows correctly after "Save & Close" → reopen.
   */
  config.fixItems = async (items) => {
    const fixed = await Promise.all(
      items.map(async (row) => {
        if (!row.product) return row;
        const image = row.image || await fetchProductImage(row.product);
        const hasCost = Number(row.production_cost) > 0 || Number(row.base_cost_inr) > 0;
        if (hasCost && image === row.image) return row;
        if (hasCost) return { ...row, image };
        try {
          const info = await fetchProductInfo(row.product);
          if (info.production_cost > 0) {
            const updated = {
              ...row,
              uom: row.uom || info.uom || '',
              image: image || info.image || '',
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
          if (image && !row.image) return { ...row, image };
        } catch (_) { }
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
    const fx = (v.currency === 'INR' || v.currency === 'Indian Rupee') ? 1 : Number(v.exchange_rate) || 1;

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
        ...((v.currency === 'INR' || v.currency === 'Indian Rupee') ? { exchange_rate: 1 } : {}),
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
    },
    {
      field: 'currency',
      label: 'Currency',
      getValue: (row) => row.currency || 'INR',
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
    grandTotalCol.type = 'number';
    grandTotalCol.dp = 2;
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

export const quotationMasters = {};
