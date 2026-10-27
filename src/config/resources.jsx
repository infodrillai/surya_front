/**
 * One config per screen. CrudPage + DocForm turn these into list, form, validation and live maths.
 * @typedef {{name:string,label:string,type?:string,master?:string,doctype?:string,filter?:Function,required?:boolean,
 *   readOnly?:boolean,readOnlyOnEdit?:boolean,summary?:boolean,positive?:boolean,showIf?:Function,options?:string[]}} FieldConfig
 */
import React from 'react';
import { Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { call, deleteDoc, getDoc, insertDoc, runAction, updateDoc } from '../api/client';
import { db } from '../db/dexie';
import { purchaseCalc, salesCalc, stageCalc, computeQuotationPR } from '../lib/formulas';
import { generateSalesOrderPDF, generateDispatchPDF, generateGoodsReceiptPDF } from '../lib/pdfUtils';

import QtyDialog from '../components/QtyDialog';
import ReturnDialog from '../components/ReturnDialog';
import GoodsReceiptDialog from '../components/GoodsReceiptDialog';
import { todayISO } from '../lib/format';
import QuotationVersionBar, { openQuotation } from '../components/QuotationVersionBar';

// ---- field helpers ---------------------------------------------------------
const t = (name, label, x = {}) => ({ name, label, type: 'text', ...x });
const num = (name, label, x = {}) => ({ name, label, type: 'number', ...x });
const cur = (name, label, x = {}) => ({ name, label, type: 'currency', ...x });
const date = (name, label, x = {}) => ({ name, label, type: 'date', default: todayISO, ...x });
const link = (name, label, master, x = {}) => ({ name, label, type: 'link', master, ...x });
const sel = (name, label, options, x = {}) => ({ name, label, type: 'select', options, ...x });
const ro = (f) => ({ ...f, readOnly: true });
const sum = (f) => ({ ...f, readOnly: true, summary: true, default: () => 0 });
const status = { field: 'is_completed', label: 'Status', type: 'doc-status' };
const workflowStatus = {
  field: 'status',
  label: 'Status',
  type: 'status',
};
const col = (field, label, type) => ({ field, label, type });


// ---- simple masters --------------------------------------------------------
const simple = (doctype, nameField, title, x = {}) => ({
  doctype, master: true, title, plural: x.plural,
  fields: [t(nameField, `${title} name`, { required: true, readOnlyOnEdit: true })],
  columns: [col(nameField, `${title} name`)],
});
const contact = [t('gstin', 'GSTIN'), t('state', 'State'), t('phone', 'Phone'), { name: 'address', label: 'Address', type: 'textarea' }];
const contactCols = [col('name', 'Name'), col('gstin', 'GSTIN'), col('state', 'State'), col('phone', 'Phone')];
const customerCols = [col('name', 'Name'), col('gstin', 'GSTIN'), col('city', 'City'), col('mobile', 'Mobile'), col('total_outstanding', 'Outstanding', 'currency')];

const uom = { ...simple('UOM', 'uom_name', 'UOM'), plural: 'Units of measure' };
const process = { ...simple('Process', 'process_name', 'Process'), plural: 'Processes' };
const category = {
  doctype: 'Category', master: true, title: 'Category', plural: 'Categories',
  fields: [
    t('category_name', 'Category name', { required: true, readOnlyOnEdit: true }),
    num('max_purchase_qty', 'Max Purchase Qty Limit (Approval threshold)'),
  ],
  columns: [
    col('category_name', 'Category name'),
    col('max_purchase_qty', 'Max Purchase Limit', 'number'),
  ],
};
const charge = { ...simple('Charge', 'charge_name', 'Charge'), subtitle: 'Labour, electricity and other Stage 3 charges.' };
const vendor = { doctype: 'Vendor', master: true, title: 'Vendor', fields: [t('vendor_name', 'Vendor name', { required: true, readOnlyOnEdit: true }), ...contact], columns: contactCols, subtitle: 'State decides CGST + SGST or IGST on purchases.' };
const customer = {
  doctype: 'Customer',
  master: true,
  title: 'Customer',
  fields: [
    t('customer_name', 'Customer name', { required: true, readOnlyOnEdit: true }),
    t('gstin', 'GSTIN'),
    t('pan', 'PAN'),
    t('mobile', 'Mobile'),
    t('email', 'Email'),
    t('city', 'City'),
    t('state', 'State'),
    { name: 'address', label: 'Address', type: 'textarea' },
    ro(cur('total_outstanding', 'Total Outstanding')),
  ],
  columns: customerCols,
};


// ---- Product (with its BOM inside) -----------------------------------------
const raw = (r) => r.product_type === 'Raw';
const bomRow = (extra = []) => [link('process', 'Process', 'Process'), link('product', 'Raw material', 'Product', { filter: raw, required: true, minWidth: 220 }), num('per_unit_utilization', 'Per-unit utilization', { positive: true }), ...extra];
const BOM_TABLES = ['stage1_items', 'stage2_items', 'stage3_charges'];
const steps = (v) => (v?.product_type && v.product_type !== 'Raw' ? Number(v.total_steps) || 3 : 0);

const product = {
  doctype: 'Product', master: true, title: 'Product', tableTabs: true,
  tableTabsEmpty: 'Raw products do not use a BOM. Select Product type "Semi" or "Finished" to configure BOM stages 1, 2, and 3.',
  subtitle: 'Raw, semi-finished and finished products. Semi / Finished products carry their BOM stages here.',
  fields: [
    t('product_name', 'Product name', { required: true }),
    t('product_code', 'Product code', { required: true, readOnlyOnEdit: true }),
    // NEW – Production Code (separate from product_code, used on finished-goods transfer)
    t('production_code', 'Production Code', { required: false }),
    sel('product_type', 'Product type', ['Raw', 'Semi', 'Finished'], { required: true, default: () => 'Raw' }),
    link('uom', 'UOM', 'UOM', { required: true }),
    link('category', 'Category', 'Category'),
    sel('total_steps', 'BOM Stages (Total steps)', [
      { value: 1, label: '1 Stage (Insert only)' },
      { value: 2, label: '2 Stages (Insert & Casting)' },
      { value: 3, label: '3 Stages (Insert, Casting & CNC / Charge)' },
    ], {
      showIf: (v) => v.product_type && v.product_type !== 'Raw',
      default: () => 3,
    }),
    num('max_purchase_qty', 'Max Purchase Qty Limit (Approval threshold)'),
    num('low_stock_limit', 'Low stock limit'),
    num('high_stock_limit', 'High stock limit'),
    { name: 'is_scrap', label: 'Scrap / wastage product', type: 'check' },
    { name: 'allow_negative_stock', label: 'Allow negative stock', type: 'check' },
  ],
  tables: [
    {
      name: 'stage1_items',
      label: 'BOM · Stage 1 (Insert - Raw materials & Scrap)',
      empty: 'Add Stage 1 raw materials and optional scrap/wastage product.',
      fields: bomRow([link('wastage_product', 'Wastage scrap product', 'Product', { filter: (r) => !!r.is_scrap, minWidth: 200 })]),
      showIf: (v) => steps(v) >= 1,
      newRow: () => ({ per_unit_utilization: '' }),
    },
    {
      name: 'stage2_items',
      label: 'BOM · Stage 2 (Casting - Secondary raw materials)',
      empty: 'Add Stage 2 raw materials.',
      fields: bomRow(),
      showIf: (v) => steps(v) >= 2,
      newRow: () => ({ per_unit_utilization: '' }),
    },
    {
      name: 'stage3_charges',
      label: 'BOM · Stage 3 (CNC / Charge - Overhead & Charges)',
      empty: 'Add Stage 3 charges (e.g. Labour, Electricity, Finishing).',
      fields: [
        link('charge', 'Charge', 'Charge', { required: true, minWidth: 200 }),
        cur('per_unit_price', 'Price per unit', { positive: true }),
        { name: 'in_tooling_base', label: 'In tooling base', type: 'check' },
      ],
      showIf: (v) => steps(v) >= 3,
      newRow: () => ({ per_unit_price: '', in_tooling_base: 0 }),
    },
  ],
  validate: (v) => {
    const e = {};
    if (v.product_type && v.product_type !== 'Raw') {
      const numSteps = Number(v.total_steps) || 3;
      if (![1, 2, 3].includes(numSteps)) e.total_steps = 'Select 1, 2 or 3 stages';
      if (numSteps >= 1 && !v.stage1_items?.length) e.stage1_items = 'Add Stage 1 BOM rows';
      if (numSteps >= 2 && !v.stage2_items?.length) e.stage2_items = 'Add Stage 2 BOM rows';
      if (numSteps >= 3 && !v.stage3_charges?.length) e.stage3_charges = 'Add Stage 3 charges';
    }
    return e;
  },
  // saved as a second document (BOM, named after the product) right after the Product
  companion: {
    doctype: 'BOM',
    tables: BOM_TABLES,
    async load(row) {
      let b = await db.BOM.get(row.name);
      if (!b) {
        try {
          b = await getDoc('BOM', row.name);
        } catch (_) {
          b = null;
        }
      }
      return b ? Object.fromEntries(BOM_TABLES.map((k) => [k, b[k] || []])) : {};
    },
    async save(saved, tables) {
      let exists = !!(await db.BOM.get(saved.name));
      if (!exists) {
        try {
          exists = !!(await getDoc('BOM', saved.name));
        } catch (_) {
          exists = false;
        }
      }
      if (saved.product_type === 'Raw') { if (exists) await deleteDoc('BOM', saved.name); return; }
      const s = Number(saved.total_steps) || 3;
      const body = {
        product: saved.name,
        stage1_items: tables.stage1_items || [],
        stage2_items: s >= 2 ? tables.stage2_items || [] : [],
        stage3_charges: s >= 3 ? tables.stage3_charges || [] : [],
      };
      if (exists) await updateDoc('BOM', saved.name, body);
      else await insertDoc('BOM', body);
    },
  },
  columns: [
    col('product_code', 'Code'),
    col('production_code', 'Production Code'),
    col('product_name', 'Name'),
    col('product_type', 'Type'),
    col('uom', 'UOM'),
    col('category', 'Category'),
    col('total_steps', 'Steps', 'number'),
  ],
};

// ---- Goods Receipt dialog state (shared) -----------------------------------
let _grDialogOpen = false;
let _grPoName = '';
let _grResolver = null;

export function openGoodsReceiptDialog(poName) {
  return new Promise((resolve) => {
    _grDialogOpen = true;
    _grPoName = poName;
    _grResolver = resolve;
    window.dispatchEvent(new CustomEvent('gr-dialog-open'));
  });
}

export function GoodsReceiptDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [poName, setPoName] = React.useState('');

  React.useEffect(() => {
    const handler = () => {
      setOpen(true);
      setPoName(_grPoName);
    };
    window.addEventListener('gr-dialog-open', handler);
    return () => window.removeEventListener('gr-dialog-open', handler);
  }, []);

  const handleClose = (result) => {
    setOpen(false);
    if (_grResolver) {
      _grResolver(result);
      _grResolver = null;
    }
  };

  return <GoodsReceiptDialog open={open} poName={poName} onClose={handleClose} />;
}

// ---- Purchase Order --------------------------------------------------------
const purchase = {
  doctype: 'Purchase Entry',
  title: 'Purchase Order',
  plural: 'Purchase Orders',
  completable: false,
  subtitle: 'Purchase orders for raw materials. Goods Receipt adds stock upon arrival.',
  summaryTitle: 'Purchase Summary',
  summaryColumns: 6,
  fields: [
    link('vendor', 'Vendor', 'Vendor', { required: true }),
    date('posting_date', 'Order date', { required: true }),
    date('expected_delivery_date', 'Expected delivery'),
    t('bill_no', 'Supplier Bill / Ref'),
    ro(t('vendor_state', 'Vendor state')),
    ro(num('total_received_qty', 'Total Received', { showIf: (_, { isNew } = {}) => !isNew })),
    ro(num('total_pending_qty', 'Total Pending', { showIf: (_, { isNew } = {}) => !isNew })),

    // Summary fields in exact required order:
    // 1. Total Order Qty
    sum(num('total_ordered_qty', 'Total Order Qty')),
    // 2. Subtotal
    sum(cur('taxable_amount', 'Subtotal')),
    // 3. Extra Charges
    { ...cur('extra_charges', 'Extra Charges', { default: () => 0 }), summary: true, editable: true },
    // 4. GST %
    { ...num('gst_percent', 'GST %', { max: 100, default: () => 0 }), summary: true, editable: true },
    // 5. GST Amount
    sum(cur('tax_amount', 'GST Amount', { default: () => 0 })),
    // 6. Grand Total
    sum(cur('grand_total', 'Grand Total')),
  ],
  tables: [{
    name: 'items',
    label: 'Items',
    newRow: () => ({
      quantity: '',
      rate: '',
      gst_percent: 0,
      amount: 0,
      landed_rate: 0,
      received_qty: 0,
      pending_qty: 0,
    }),
    empty: 'Add the raw materials on this order.',
    fields: [
      link('product', 'Product', 'Product', { filter: raw, required: true, minWidth: 220, labelField: 'product_name' }),
      num('quantity', 'Ordered Qty', { positive: true }),
      ro(t('uom', 'UOM')),
      cur('rate', 'Rate'),
      ro(cur('amount', 'Amount')),
      ro(num('received_qty', 'Received', { showIf: (_, { isNew } = {}) => !isNew })),
      ro(num('pending_qty', 'Pending', { showIf: (_, { isNew } = {}) => !isNew })),
      num('gst_percent', 'GST %', { hidden: true, showIf: () => false }),
      ro(cur('landed_rate', 'Landed rate', { dp: 4, showIf: (_, { isNew } = {}) => !isNew })),
    ],
  }],
  compute: (v, ctx) => purchaseCalc(v, ctx),
  validate: (v) => (v.items?.length ? {} : { items: 'Add at least one item' }),
  columns: [
    col('name', 'Order No'),
    col('vendor', 'Vendor'),
    col('posting_date', 'Order Date', 'date'),
    col('expected_delivery_date', 'Expected Delivery', 'date'),
    col('total_ordered_qty', 'Ordered', 'number'),
    col('total_received_qty', 'Received', 'number'),
    col('total_pending_qty', 'Pending', 'number'),
    { field: 'status', label: 'Status', type: 'purchase-status' },
    col('approval_status', 'Approval'),
  ],
  rowActions: [
    {
      key: 'confirm_order',
      label: 'Confirm Order',
      show: (r) => (!r.status || r.status === 'Draft' || r.status === 'Approved') && r.approval_status !== 'Pending',
      run: async (r) => {
        await runAction('Purchase Entry', r.name, 'confirm_order');
        return `Purchase Order ${r.name} confirmed as Ordered.`;
      },
    },
    {
      key: 'approve_purchase',
      label: 'Approve',
      show: (r) => r.status === 'Pending Approval' || r.approval_status === 'Pending',
      run: async (r) => {
        await call('clssurya.api.run_action', { doctype: 'Purchase Entry', name: r.name, action: 'approve_purchase' });
        return `Purchase Order ${r.name} approved.`;
      },
    },
    {
      key: 'reject_purchase',
      label: 'Reject',
      show: (r) => r.status === 'Pending Approval' || r.approval_status === 'Pending',
      run: async (r) => {
        const reason = window.prompt(`Enter rejection reason for Purchase Order ${r.name}:`);
        if (!reason) return 'Rejection cancelled (reason is required).';
        await call('clssurya.api.run_action', { doctype: 'Purchase Entry', name: r.name, action: 'reject_purchase', args: { reason } });
        return `Purchase Order ${r.name} rejected.`;
      },
    },
    {
      key: 'receive_goods',
      label: 'Receive Goods',
      show: (r) =>
        ['Ordered', 'Partially Received'].includes(r.status) &&
        (Number(r.total_pending_qty) > 0 || r.total_pending_qty == null),
      run: async (r) => {
        const res = await openGoodsReceiptDialog(r.name);
        return res ?? 'Receipt dialog closed.';
      },
    },
    {
      key: 'view_receipts',
      label: 'Receipts',
      show: (r) => ['Ordered', 'Partially Received', 'Received'].includes(r.status),
      run: async (r) => {
        const res = await openGoodsReceiptDialog(r.name);
        return res ?? 'Receipts reviewed.';
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      show: (r) =>
        ['Draft', 'Ordered'].includes(r.status) && (Number(r.total_received_qty) || 0) === 0,
      run: async (r) => {
        const ok = window.confirm(`Cancel Purchase Order ${r.name}?`);
        if (!ok) return `Purchase Order ${r.name} not cancelled.`;
        await runAction('Purchase Entry', r.name, 'cancel_order');
        return `Purchase Order ${r.name} cancelled.`;
      },
    },
  ],
};

// ---- Stage batches (Insert, Casting, CNC / Charge) -------------------------
const stageRows = (stage) => async (v) => {
  const r = await call('clssurya.api.get_stage_rows', { product: v.product, qty: v.quantity, stage });
  return { top: { wastage_product: r.wastage_product || '' }, tables: { items: r.items, ...(stage === 3 ? { charges: r.charges } : {}) } };
};
const itemFields = [
  link('process', 'Process', 'Process', { readOnly: true }), link('product', 'Product', 'Product', { readOnly: true, minWidth: 200 }),
  ro(num('per_unit_utilization', 'Per unit', { dp: 4 })), ro(num('total_utilization', 'Estimate', { dp: 4 })),
  num('actual_utilization', 'Actual used'), ro(cur('unit_price', 'Unit price', { dp: 4 })), ro(cur('actual_amount', 'Actual amount')),
  cur('extra_cost', 'Extra cost / pc'),
];

const STAGE_TITLES = { 1: 'Stage 1 (Insert Making) batch', 2: 'Stage 2 (PU & Casting) batch', 3: 'Stage 3 (CNC) batch' };
const STAGE_PLURALS = { 1: 'Stage 1 (Insert Making) batches', 2: 'Stage 2 (PU & Casting) batches', 3: 'Stage 3 (CNC) batches' };

const stageConfig = (stage) => ({
  doctype: `Stage ${stage} Batch`,
  title: STAGE_TITLES[stage] || `Stage ${stage} batch`,
  plural: STAGE_PLURALS[stage] || `Stage ${stage} batches`,
  completable: true,
  summaryTitle: 'Live cost',
  fields: [
    link('product', stage === 3 ? 'Finished product' : 'Product to produce', 'Product', { required: true, minWidth: 240, filter: (r) => r.product_type !== 'Raw' && Number(r.total_steps) >= stage }),
    //t('production_code', 'Production Code'),
    num('quantity', 'Quantity produced', { positive: true }), date('posting_date', 'Date'),
    //t('operator', 'Operator / Worker'),
    //link('process', 'Process / Operation', 'Process'),
    ...(stage === 3 ? [link('machine', 'CNC Machine', 'CNC Machine')] : []),
    ...(stage === 1 ? [num('weight_per_piece', 'Weight per piece', { positive: true }), ro(num('wastage_qty', 'Wastage (to scrap)', { dp: 4 }))] : []),
    ...(stage === 3 ? [num('tooling_percent', 'Tooling cost %', { max: 100 }), ro(cur('tooling_base', 'Tooling base (carried + ticked charges)', { minWidth: 220 }))] : []),
    num('rejection_percent', stage === 3 ? 'Rejection % (on everything)' : 'Rejection %', { max: 99.99 }),
    sum(cur('carried_cost', 'Carried cost')), sum(cur('added_cost', 'Added cost')),
    ...(stage === 3 ? [sum(cur('tooling_amount', 'Tooling cost'))] : []),
    sum(cur('rejection_amount', 'Rejection')), sum(cur('batch_total', 'Batch total')), sum(cur('unit_cost', 'Unit cost', { dp: 3 })),
    t('remarks', 'Remarks'),
    //ro(t('status', 'Status')),
  ],
  tables: [
    { name: 'items', label: stage === 1 ? 'Insert Making raw materials' : stage === 2 ? 'PU & Casting consumption (carried-in + raw)' : 'Carried-in PU & Casting stock', fields: itemFields, noAdd: true },
    ...(stage === 3 ? [{ name: 'charges', label: 'Charges', noAdd: true, fields: [link('charge', 'Charge', 'Charge', { readOnly: true }), cur('per_unit_price', 'Per unit'), { name: 'in_tooling_base', label: 'In tooling base', type: 'check' }, ro(cur('amount', 'Amount'))] }] : []),
  ],

  // one calculation, shared with the tests (extra cost, tooling and rejection are all inside stageCalc)
  compute: (v) => stageCalc(stage, v),

  loadKey: (v) => (v.product && Number(v.quantity) > 0 ? `${v.product}|${v.quantity}` : null),
  loadRows: stageRows(stage),
  columns: [col('name', 'Batch No'), col('product', 'Product'), col('quantity', 'Quantity', 'number'), col('unit_cost', 'Unit cost', 'currency'), col('batch_total', 'Batch total', 'currency'), status],
  // Validate numeric fields to avoid NaN when saving/completing
  validate: (v) => {
    const e = {};
    const numFields = ['quantity', 'tooling_percent', 'rejection_percent'];
    numFields.forEach((f) => {
      if (v[f] !== undefined && isNaN(Number(v[f]))) {
        e[f] = 'Expected number, received NaN';
      }
    });
    return e;
  },
});
export const STAGE_CONFIGS = [stageConfig(1), stageConfig(2), stageConfig(3)];

// ---- Sales -----------------------------------------------------------------
const finished = (r) => r.product_type === 'Finished';

// Fetch default UOM and cost/unit when a product is selected in a row
const fetchProductInfo = async (product) => {
  if (!product) return {};
  try {
    const doc = await getDoc('Product', product);
    return {
      uom: doc?.uom || '',
      production_cost: doc?.production_cost || 0,
    };
  } catch (e) {
    console.warn('Unable to fetch product info for', product, e);
    return {};
  }
};
const belowBanner = (v) => (v.below_cost ? { severity: 'warning', text: 'One or more rows are priced below production cost.' } : null);

// Helper to compute final rate (including PR) and line amount
const computeLineAmount = (row) => {
  const qty = Number(row.quantity) || 0;
  const rate = Number(row.rate) || 0;
  const pr = Number(row.pr) || 0;
  const addCost = (rate * pr) / 100;
  const finalRate = rate + addCost;
  return { finalRate, amount: qty * finalRate };
};
const salesRow = [
  // Product with onChange to fill UOM and cost/unit
  {
    ...link('product', 'Product', 'Product', {
      required: true,
      minWidth: 220,
      labelField: 'product_name',
      onChange: async (row) => {
        const info = await fetchProductInfo(row.product);
        row.uom = info.uom;
        row.production_cost = info.production_cost;
      },
    }),
  },
  ro(t('uom', 'UOM')),
  ro(cur('production_cost', 'Cost / unit', { dp: 4 })),
  num('quantity', 'Qty', { positive: true, onChange: (row) => { const { finalRate, amount } = computeLineAmount(row); row.final_rate = finalRate; row.amount = amount; } }),
  num('pr', 'PR (%)', { dp: 2, default: () => 0, onChange: (row) => { const { finalRate, amount } = computeLineAmount(row); row.final_rate = finalRate; row.amount = amount; } }),
  // per‑line Discount & GST (displayed below item fields)
  cur('rate', 'Rate', { onChange: (row) => { const { finalRate, amount } = computeLineAmount(row); row.final_rate = finalRate; row.amount = amount; } }),
  ro(cur('amount', 'Amount')),
];

// ---- Quotation-specific row ---------------------------------------------------
const quotationLineCalc = (row) => {
  const cost = Number(row.production_cost) || 0;
  const pr = Number(row.pr) || 0;
  const qty = Number(row.quantity) || 0;
  const rate = cost * (1 + pr / 100);
  const amount = qty * rate;
  return { rate, amount };
};

const quotationRow = [
  {
    ...link('product', 'Product', 'Product', {
      required: true,
      minWidth: 220,
      labelField: 'product_name',
      onChange: async (row) => {
        const info = await fetchProductInfo(row.product);
        row.uom = info.uom;
        row.production_cost = info.production_cost;
        // Recalculate rate & amount with the new cost
        const { rate, amount } = quotationLineCalc({ ...row, production_cost: info.production_cost });
        row.rate = rate;
        row.amount = amount;
      },
    }),
  },
  ro(t('uom', 'UOM')),
  ro(cur('production_cost', 'Cost / unit', { dp: 4 })),
  num('quantity', 'Qty', { positive: true, onChange: (row) => { const { rate, amount } = quotationLineCalc(row); row.rate = rate; row.amount = amount; } }),
  num('pr', 'PR (%)', { dp: 2, default: () => 0, onChange: (row) => { const { rate, amount } = quotationLineCalc(row); row.rate = rate; row.amount = amount; } }),
  ro(cur('rate', 'Rate', { dp: 4 })),     // Cost/unit × (1 + PR%) — auto-calculated
  ro(cur('amount', 'Amount')),
];



// --- quotation -----------------------------------------------------------------
const quotation = {
  doctype: 'Quotation',
  title: 'Quotation',
  usesFinishedCost: true,
  subtitle: 'Quotation with discount, GST and versioning.',

  isLocked: (d) =>
    ['Superseded', 'Accepted'].includes(d?.status),

  fields: [
    link('customer', 'Customer', 'Customer', { required: true }),
    date('quotation_date', 'Date'),

    // ---- Summary panel (order = display order) ----
    sum(cur('subtotal', 'Item Subtotal')),
    { ...cur('packing_charges', 'Packing Charges', { default: () => 0 }), summary: true, editable: true },
    { ...cur('transport_charges', 'Transport Charges', { default: () => 0 }), summary: true, editable: true },

    { ...num('discount_percent', 'Discount (%)', { max: 100, default: () => 0 }), summary: true, editable: true },
    sum(cur('discount_amount', 'Discount Amount')),
    // Packing & Transport — editable in summary panel
    { ...num('gst_percent', 'GST (%)', { max: 100, default: () => 18 }), summary: true, editable: true },
    sum(cur('tax_amount', 'GST Amount')),
    sum(cur('grand_total', 'Grand Total')),
  ],
  summaryTitle: 'Quotation Summary',
  summaryColumns: 8,


  // Show version badge and previous quotation link inside the form header
  header: (v, doc) => {
    if (!doc?.name ? <QuotationVersionBar doc={doc} /> : null);
    const version = doc?.version || v?.version;
    const prevVersion = doc?.previous_version || v?.previous_version;
    const parentQuotation = doc?.parent_quotation || v?.parent_quotation;
    return (
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 0.5 }}>
        {version && (
          <Chip
            size="small"
            label={`Version ${version}`}
            color="info"
            variant="outlined"
          />
        )}
        {prevVersion && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => window.open(`/quotation?open=${encodeURIComponent(prevVersion)}`, '_blank')}
            sx={{ fontSize: 11, py: 0.25 }}
          >
            Previous: {prevVersion}
          </Button>
        )}
        {parentQuotation && parentQuotation !== prevVersion && (
          <Chip
            size="small"
            label={`Parent: ${parentQuotation}`}
            variant="outlined"
            color="default"
          />
        )}
        <Button
          size="small"
          variant="contained"
          startIcon={<DownloadRoundedIcon fontSize="small" />}
          onClick={() => generateQuotationPDF(doc || v)}
          sx={{
            fontSize: 11.5,
            fontWeight: 600,
            py: 0.4,
            px: 1.5,
            bgcolor: '#0d2b56',
            '&:hover': { bgcolor: '#1e3a8a' },
            color: '#ffffff',
            borderRadius: '6px',
            textTransform: 'none',
            boxShadow: '0 2px 6px rgba(13, 43, 86, 0.25)',
          }}
        >
          Download PDF
        </Button>
      </Box>
    );
  },

  tables: [{
    name: 'items',
    label: 'Items',
    fields: quotationRow,
    newRow: () => ({ quantity: '', pr: 0, name: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` }),
    empty: 'Add finished products to quote.',
  }],


  compute: (v, ctx) => {
    // Fill production_cost from finishedCost (live Stage 3 unit price) when available
    const base = salesCalc(v, ctx);
    const baseItems = base.rows?.items || v.items || [];

    // For each row: rate = production_cost × (1 + pr/100), amount = qty × rate
    const items = baseItems.map((item) => {
      const cost = Number(item.production_cost) || 0;
      const pr = Number(item.pr) || 0;
      const qty = Number(item.quantity) || 0;
      const rate = cost * (1 + pr / 100);
      const amount = qty * rate;
      return { ...item, rate, amount };
    });

    const subtotal = items.reduce((t, it) => t + it.amount, 0);
    const discountPct = Math.min(100, Math.max(0, Number(v.discount_percent) || 0));
    const discountAmt = (subtotal * discountPct) / 100;
    const packingCharges = Number(v.packing_charges) || 0;
    const transportCharges = Number(v.transport_charges) || 0;
    const taxableAmt = Math.max(0, subtotal - discountAmt) + packingCharges + transportCharges;
    const gstPct = v.gst_percent !== undefined && v.gst_percent !== null && v.gst_percent !== '' ? Number(v.gst_percent) : 18;

    const custState = ctx?.masters?.Customer?.[v.customer]?.state || '';
    const same = !custState || custState.trim().toLowerCase() === 'gujarat';
    let cgst = 0, sgst = 0, igst = 0;
    if (same) {
      cgst = (taxableAmt * (gstPct / 2)) / 100;
      sgst = (taxableAmt * (gstPct / 2)) / 100;
    } else {
      igst = (taxableAmt * gstPct) / 100;
    }
    const taxAmt = cgst + sgst + igst;

    return {
      top: {
        ...base.top,
        subtotal,
        discount_amount: discountAmt,
        packing_charges: packingCharges,
        transport_charges: transportCharges,
        taxable_amount: taxableAmt,
        cgst,
        sgst,
        igst,
        tax_amount: taxAmt,
        total_amount: subtotal,
        grand_total: taxableAmt + taxAmt,
      },
      rows: { items },
    };
  },


  validate: (v) => {
    const errors = {};

    if (!v.items?.length) {
      errors.items = 'Add at least one item';
    }

    if (Number(v.discount_percent) < 0 ||
      Number(v.discount_percent) > 100) {
      errors.discount_percent =
        'Discount must be between 0 and 100';
    }

    if (Number(v.gst_percent) < 0 ||
      Number(v.gst_percent) > 100) {
      errors.gst_percent =
        'GST must be between 0 and 100';
    }

    return errors;
  },

  columns: [
    col('name', 'No'),
    col('customer', 'Customer'),
    col('quotation_date', 'Date', 'date'),
    col('subtotal', 'Subtotal', 'currency'),
    //col('taxable_amount', 'Taxable', 'currency'),
    col('grand_total', 'Grand Total', 'currency'),
    col('status', 'Status', 'status'),
  ],


  rowActions: [
    {
      key: 'revise',
      label: 'Revise Quotation',
      show: (r) => !['Superseded', 'Accepted'].includes(r.status),
      run: async (r) => {
        const resp = await runAction('Quotation', r.name, 'revise');
        const newName = resp?.result;
        if (newName) openQuotation(newName);
        return newName ? `Revision ${newName} created.` : 'Revision created.';
      },

    },
    {
      key: 'approve',
      label: 'Approve',
      show: (r) => r.status === 'Draft',
      run: async (r) => {
        const result = await runAction('Quotation', r.name, 'approve');
        return result?.result ? `Approved ${r.name}` : `Failed to approve ${r.name}`;
      },
    },
    {
      key: 'order',
      label: 'Create order',
      show: (r) => r.status === 'Approved',
      run: async (r) => {
        const soResult = await runAction('Quotation', r.name, 'make_sales_order');
        const soName = soResult.result;
        return `Created Sales Order ${soName}`;
      },
    },
    {
      key: 'download_pdf',
      label: 'Download PDF',
      variant: 'contained',
      sx: {
        bgcolor: '#1e3a8a',
        '&:hover': { bgcolor: '#0d2b56' },
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 500,
        py: 0.2,
        px: 1, 
        textTransform: 'none',
        boxShadow: '0 1px 3px rgba(13, 43, 86, 0.2)',
      },
      show: () => true,
      run: async (r) => {
        await generateQuotationPDF(r);
        return `Quotation PDF ready for ${r.name}`;
      },
    },
  ],

};


// ---- Sales Order: module-level dialog state (shared across actions) ----------
let _soDialogOpen = false;
let _soDialogData = { orderId: '', pendingItems: [] };
let _soDialogResolver = null;

/** Open the QtyDialog from a rowAction and await the user's response. */
async function openQtyDialog(orderId, pendingItems) {
  return new Promise((resolve) => {
    _soDialogOpen = true;
    _soDialogData = { orderId, pendingItems };
    _soDialogResolver = resolve;
    // Force a re-render by dispatching a custom event
    window.dispatchEvent(new CustomEvent('so-qty-dialog-open'));
    // The dialog calls resolve when it closes
  });
}

/**
 * SalesOrderQtyDialogHost – mount this once in the app tree (e.g. in App.jsx).
 * It listens for the custom event and renders the QtyDialog.
 */
export function SalesOrderQtyDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [orderId, setOrderId] = React.useState('');
  const [pendingItems, setPendingItems] = React.useState([]);

  React.useEffect(() => {
    const handler = () => {
      setOpen(true);
      setOrderId(_soDialogData.orderId);
      setPendingItems(_soDialogData.pendingItems);
    };
    window.addEventListener('so-qty-dialog-open', handler);
    return () => window.removeEventListener('so-qty-dialog-open', handler);
  }, []);

  const handleClose = (result) => {
    setOpen(false);
    if (_soDialogResolver) {
      _soDialogResolver(result);
      _soDialogResolver = null;
    }
  };

  const handleSubmit = async (items) => {
    const result = await runAction('Sales Order', orderId, 'create_dispatch_from_sales_order', { items });
    const dispatchName = result?.name;
    if (dispatchName) {
      return `Dispatch ${dispatchName} created successfully.`;
    }
    return result?.result ?? 'Dispatch created.';
  };

  return (
    <QtyDialog
      open={open}
      onClose={handleClose}
      orderId={orderId}
      pendingItems={pendingItems}
      onSubmit={handleSubmit}
    />
  );
}

const salesOrder = {
  doctype: 'Sales Order',
  title: 'Sales order',
  plural: 'Sales orders',
  usesFinishedCost: true,
  subtitle: 'Admin approves. Stock is deducted only when goods are dispatched.',

  isLocked: (d) => !!d?.status && d.status !== 'Pending Approval',

  fields: [
    link('customer', 'Customer', 'Customer', { required: true }),
    date('order_date', 'Date'),
    // ---- Summary panel (order = display order) ----
    sum(cur('subtotal', 'Subtotal')),
    { ...cur('packing_charges', 'Packing Charges', { default: () => 0 }), summary: true, editable: true },
    { ...cur('transport_charges', 'Transport Charges', { default: () => 0 }), summary: true, editable: true },
        num('discount_percent', 'Discount (%)', { max: 100, default: () => 0, summary: true, editable: true }),
    sum(cur('discount_amount', 'Discount Amount')),
    // Packing & Transport — editable in summary panel
    num('gst_percent', 'GST (%)', { max: 100, default: () => 18, summary: true, editable: true }),
    sum(cur('tax_amount', 'GST Amount')),
    sum(cur('grand_total', 'Grand Total')),
  ],
  summaryColumns: 8,

  tables: [{
    name: 'items',
    label: 'Items',
    fields: [
      ...salesRow.slice(0, 5),
      ro(cur('final_rate', 'Final rate', { dp: 4 })),
      ro(cur('amount', 'Amount')),
      ro(num('dispatched_qty', 'Dispatched')),
      ro(num('returned_qty', 'Returned')),
      ro(num('net_delivered_qty', 'Delivered')),
      ro(num('pending_qty', 'Pending')),
    ],
    newRow: () => ({ quantity: '', pr: 0, rate: '' }),
  }],

  compute: (v, ctx) => {
    // Use salesCalc as base then recompute totals with discount/GST/charges
    const base = salesCalc(v, ctx);
    const items = base.rows?.items || v.items || [];
    const subtotal = items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const discountPct = Math.min(100, Math.max(0, Number(v.discount_percent) || 0));
    const discountAmt = subtotal * discountPct / 100;
    const packingCharges = Number(v.packing_charges) || 0;
    const transportCharges = Number(v.transport_charges) || 0;
    const taxableAmt = Math.max(0, subtotal - discountAmt) + packingCharges + transportCharges;
    const gstPct = Math.min(100, Math.max(0, Number(v.gst_percent) || 0));
    const taxAmt = taxableAmt * gstPct / 100;
    return {
      top: {
        ...base.top,
        subtotal,
        total_amount: subtotal,
        discount_amount: discountAmt,
        packing_charges: packingCharges,
        transport_charges: transportCharges,
        taxable_amount: taxableAmt,
        tax_amount: taxAmt,
        grand_total: taxableAmt + taxAmt,
      },
      rows: { items },
    };
  },
  banner: belowBanner,

  header: (v) => {
    const ordered = (v.items || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const sent = (v.items || []).reduce((s, r) => s + (Number(r.dispatched_qty) || 0), 0);
    return ordered && sent ? (
      <Stack spacing={0.5}>
        <Typography variant="body2">Dispatched {sent} of {ordered}</Typography>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, (sent / ordered) * 100)}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Stack>
    ) : null;
  },
  validate: (v) => (v.items?.length ? {} : { items: 'Add at least one item' }),
  columns: [
    col('name', 'No'),
    col('customer', 'Customer'),
    col('order_date', 'Date', 'date'),
    col('grand_total', 'Grand Total', 'currency'),
    workflowStatus,
  ],

  rowActions: [
    {
      key: 'approve',
      label: 'Approve',
      show: (r, admin) => admin && r.status === 'Pending Approval',
      run: async (r) => {
        await runAction('Sales Order', r.name, 'approve');
        return `${r.name} approved successfully`;
      },
    },
    {
      key: 'reject',
      label: 'Reject',
      show: (r, admin) => admin && r.status === 'Pending Approval',
      run: async (r) => {
        const ok = window.confirm(`Reject Sales Order ${r.name}?`);
        if (!ok) return `${r.name} not rejected.`;
        await runAction('Sales Order', r.name, 'reject');
        return `${r.name} rejected.`;
      },
    },
    {
      key: 'dispatch',
      label: 'Convert to Dispatch',
      show: (r) => ['Approved', 'Partially Dispatched'].includes(r.status),
      run: async (r) => {
        // 1. Fetch pending items from backend
        const resp = await runAction('Sales Order', r.name, 'create_dispatch');
        const pending = resp?.pending_items || [];
        if (!pending.length) {
          return 'All items have already been fully dispatched.';
        }
        // 2. Open QtyDialog and wait for user input
        const result = await openQtyDialog(r.name, pending);
        // result is null if user cancelled, or the success message string
        return result ?? 'Dispatch cancelled.';
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      show: (r) => !['Completed', 'Cancelled'].includes(r.status),
      run: async (r) => {
        const ok = window.confirm(`Cancel Sales Order ${r.name}? This cannot be undone.`);
        if (!ok) return `Sales Order ${r.name} not cancelled.`;
        await runAction('Sales Order', r.name, 'cancel');
        return `Sales Order ${r.name} cancelled.`;
      },
    },
    {
      key: 'download',
      label: 'Download PDF',
      show: (r) => true,
      icon: DownloadRoundedIcon,
      variant: 'contained',
      sx: { bgcolor: '#1b5e20', color: '#fff', '&:hover': { bgcolor: '#2e7d32' }, fontWeight: 700, fontSize: '0.72rem', px: 1.2, py: 0.4, mr: 0.5 },
      run: async (r) => {
        const doc = await getDoc('Sales Order', r.name);
        if (!doc) return 'Sales Order not found';
        generateSalesOrderPDF(doc);
        return `PDF generated for ${r.name}`;
      },
    },
  ],
};

// ---- Return dialog state (shared) ------------------------------------------
let _returnDialogOpen = false;
let _returnDispatchName = '';
let _returnResolver = null;

function openReturnDialog(dispatchName) {
  return new Promise((resolve) => {
    _returnDialogOpen = true;
    _returnDispatchName = dispatchName;
    _returnResolver = resolve;
    window.dispatchEvent(new CustomEvent('return-dialog-open'));
  });
}

/** Mount once in App.jsx alongside SalesOrderQtyDialogHost. */
export function ReturnDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [dispatchName, setDispatchName] = React.useState('');

  React.useEffect(() => {
    const handler = () => {
      setOpen(true);
      setDispatchName(_returnDispatchName);
    };
    window.addEventListener('return-dialog-open', handler);
    return () => window.removeEventListener('return-dialog-open', handler);
  }, []);

  const handleClose = (result) => {
    setOpen(false);
    if (_returnResolver) {
      _returnResolver(result);
      _returnResolver = null;
    }
  };

  return <ReturnDialog open={open} dispatchName={dispatchName} onClose={handleClose} />;
}

const dispatch = {
  doctype: 'Dispatch',
  title: 'Dispatch',
  plural: 'Dispatches',
  completable: false,
  usesFinishedCost: true,
  subtitle: 'Ship against an approved order. Mark as Dispatched deducts Finished stock.',
  fields: [
    { name: 'sales_order', label: 'Sales order', type: 'link', doctype: 'Sales Order', required: true, readOnlyOnEdit: true, filter: (r) => ['Approved', 'Partially Dispatched'].includes(r.status), minWidth: 240 },
    ro(t('customer', 'Customer')),
    date('dispatch_date', 'Dispatch date'),
    { name: 'remarks', label: 'Vehicle / Remarks', type: 'textarea' },
  ],
  tables: [{
    name: 'items',
    label: 'Items',
    noAdd: true,
    fields: [
      ro(t('product', 'Product')),
      ro(num('ordered_qty', 'Ordered')),
      ro(num('already_dispatched', 'Already sent')),
      num('quantity', 'Dispatch now', { tooltip: 'Enter quantity to dispatch now (can be less than pending)', onChange: (row, table) => { const ordered = Number(row.ordered_qty) || 0; const already = Number(row.already_dispatched) || 0; const remaining = ordered - already; const qty = Number(row.quantity) || 0; if (qty <= 0) { alert('Quantity must be greater than 0'); row.quantity = ''; } else if (qty > remaining) { alert(`You cannot dispatch ${qty}. Only ${remaining} remaining.`); row.quantity = remaining; } if (table && typeof table.updateRow === 'function') { table.updateRow(row); } } }),
      ro(cur('unit_cost', 'Cost / unit', { dp: 4 }))
    ]
  }],
  loadKey: (v) => v.sales_order || null,
  loadRows: async (v, { finishedCost }) => {
    const so = await getDoc('Sales Order', v.sales_order);
    return {
      top: { sales_order: v.sales_order, customer: so.customer, order_status: so.status },
      tables: {
        items: so.items
          .filter((i) => (Number(i.quantity) || 0) - (Number(i.dispatched_qty) || 0) > 0)
          .map((i) => ({
            order_item: i.name,
            product: i.product,
            ordered_qty: Number(i.quantity) || 0,
            already_dispatched: Number(i.dispatched_qty) || 0,
            quantity: (Number(i.quantity) || 0) - (Number(i.dispatched_qty) || 0),
            unit_cost: finishedCost?.[i.product]?.unit_price || 0,
          })),
      },
    };
  },
  rowActions: [
    {
      key: 'confirm',
      label: 'Confirm',
      show: (r) => r.dispatch_status === 'Draft' || r.dispatch_status === 'Pending Confirmation',
      run: async (r) => {
        const ok = window.confirm(
          `Confirm Dispatch ${r.name}? This will deduct stock and cannot be undone easily.`
        );
        if (!ok) return `Dispatch ${r.name} not confirmed.`;
        await runAction('Dispatch', r.name, 'confirm_dispatch');
        return `Dispatch ${r.name} confirmed — stock deducted.`;
      },
    },
    {
      key: 'return',
      label: 'Return',
      show: (r) => r.dispatch_status === 'Dispatched',
      run: async (r) => {
        const result = await openReturnDialog(r.name);
        return result ?? 'Return cancelled.';
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      show: (r) => ['Draft', 'Pending Confirmation', 'Dispatched'].includes(r.dispatch_status),
      run: async (r) => {
        const isConfirmed = r.dispatch_status === 'Dispatched';
        const msg = isConfirmed
          ? `Cancel CONFIRMED Dispatch ${r.name}? This will REVERSE stock deductions. This requires admin rights.`
          : `Cancel Draft Dispatch ${r.name}? This will not affect inventory.`;
        const ok = window.confirm(msg);
        if (!ok) return `Dispatch ${r.name} not cancelled.`;
        await runAction('Dispatch', r.name, 'cancel_dispatch');
        return isConfirmed
          ? `Dispatch ${r.name} cancelled — stock restored.`
          : `Dispatch ${r.name} cancelled.`;
      },
    },
    {
      key: 'download_pdf',
      label: 'Download PDF',
      show: () => true,
      variant: 'contained',
      sx: { bgcolor: '#1b5e20', color: '#fff', '&:hover': { bgcolor: '#2e7d32' }, fontWeight: 700, fontSize: '0.72rem', px: 1.2, py: 0.4, mr: 0.5 },
      run: async (r) => {
        const fullDoc = await getDoc('Dispatch', r.name);
        await generateDispatchPDF(fullDoc || r);
        return `PDF generated for ${r.name}`;
      },
    },
  ],
  validate: (v) => {
    const e = {};
    (v.items || []).forEach((r, i) => {
      const remaining = (Number(r.ordered_qty) || 0) - (Number(r.already_dispatched) || 0);
      if ((Number(r.quantity) || 0) > remaining + 1e-9) {
        e[`items.${i}.quantity`] = `More than remaining (${remaining})`;
      }
      if ((Number(r.quantity) || 0) <= 0) {
        e[`items.${i}.quantity`] = 'Must be greater than 0';
      }
    });
    return e;
  },
  columns: [
    col('name', 'No'),
    col('sales_order', 'Sales order'),
    col('customer', 'Customer'),
    col('dispatch_date', 'Date', 'date'),
    col('dispatch_status', 'Status', 'dispatch-status'),
    col('grand_total', 'Grand Total', 'currency'),

  ],
};

// ---- Customer Return ---------------------------------------------------------
const RETURN_STATUS_COLOR = {
  Draft: 'default',
  Confirmed: 'success',
  Cancelled: 'error',
};

const customerReturn = {
  doctype: 'Customer Return',
  title: 'Customer Return',
  plural: 'Customer Returns',
  subtitle: 'Physical goods returned by customer against a confirmed dispatch.',

  isLocked: (d) => ['Confirmed', 'Cancelled'].includes(d?.return_status),

  fields: [
    {
      name: 'dispatch', label: 'Dispatch', type: 'link', doctype: 'Dispatch', required: true, readOnlyOnEdit: true,
      filter: (r) => r.dispatch_status === 'Dispatched', minWidth: 240
    },
    ro(t('sales_order', 'Sales Order')),
    ro(t('customer', 'Customer')),
    date('return_date', 'Return Date'),
    { name: 'return_reason', label: 'Return Reason', type: 'textarea', required: true },
    { name: 'remarks', label: 'Remarks', type: 'textarea' },
  ],

  tables: [{
    name: 'items',
    label: 'Items',
    noAdd: true,
    fields: [
      ro(t('product', 'Product')),
      ro(num('dispatched_qty', 'Dispatched')),
      ro(num('already_returned', 'Already Returned')),
      ro(num('returnable_qty', 'Returnable')),
      num('return_qty', 'Return Qty', { positive: true }),
      sel('condition', 'Condition', ['Usable', 'Damaged', 'Requires Inspection']),
    ],
  }],

  validate: (v) => {
    const e = {};
    if (!v.return_reason?.trim()) e.return_reason = 'Return reason is required';
    (v.items || []).forEach((r, i) => {
      if ((Number(r.return_qty) || 0) <= 0) {
        e[`items.${i}.return_qty`] = 'Must be > 0';
      }
      if ((Number(r.return_qty) || 0) > (Number(r.returnable_qty) || 0) + 1e-9) {
        e[`items.${i}.return_qty`] = `Max returnable: ${r.returnable_qty}`;
      }
    });
    return e;
  },

  columns: [
    col('name', 'No'),
    col('dispatch', 'Dispatch'),
    col('customer', 'Customer'),
    col('return_date', 'Date', 'date'),
    col('return_status', 'Status', 'return-status'),
  ],

  rowActions: [
    {
      key: 'confirm',
      label: 'Confirm Return',
      show: (r) => r.return_status === 'Draft',
      run: async (r) => {
        const ok = window.confirm(
          `Confirm Return ${r.name}? This will add usable goods back to Finished stock and move damaged goods to the Damaged location.`
        );
        if (!ok) return `Return ${r.name} not confirmed.`;
        await runAction('Customer Return', r.name, 'confirm_return');
        return `Return ${r.name} confirmed — stock updated.`;
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      show: (r) => ['Draft', 'Confirmed'].includes(r.return_status),
      run: async (r) => {
        const isConfirmed = r.return_status === 'Confirmed';
        const msg = isConfirmed
          ? `Cancel CONFIRMED Return ${r.name}? This will REVERSE stock changes. Requires admin.`
          : `Cancel Draft Return ${r.name}?`;
        const ok = window.confirm(msg);
        if (!ok) return `Return ${r.name} not cancelled.`;
        await runAction('Customer Return', r.name, 'cancel_return');
        return isConfirmed
          ? `Return ${r.name} cancelled — stock reversed.`
          : `Return ${r.name} cancelled.`;
      },
    },
  ],
};

const goodsReceipt = {
  doctype: 'Goods Receipt',
  title: 'Goods Receipt',
  plural: 'Goods Receipts',
  completable: false,
  readOnlyList: false,
  subtitle: 'Confirmed vendor receipts. Receiving goods increases Raw inventory.',
  fields: [
    link('purchase_order', 'Purchase Order', 'Purchase Entry', { required: true, readOnlyOnEdit: true }),
    ro(t('vendor', 'Vendor')),
    date('posting_date', 'Receipt Date', { required: true }),
    t('supplier_delivery_note', 'Delivery Note / Challan'),
    //ro(t('status', 'Status')),
    ro(cur('total_amount', 'Total Value')),
    ro(num('total_qty', 'Total Quantity')),
    { name: 'remarks', label: 'Remarks', type: 'textarea' },
  ],
  tables: [{
    name: 'items', label: 'Received Items',
    fields: [
      link('product', 'Product', 'Product', { readOnly: true }),
      ro(t('uom', 'UOM')),
      ro(num('received_qty', 'Received Qty')),
      ro(cur('landed_rate', 'Rate / Unit', { dp: 4 })),
      ro(cur('amount', 'Amount')),
    ],
  }],
  compute: (v) => ({
  top: {},
  rows: {
    items: (v.items || []).map((row) => ({
      ...row,
      amount:
        (Number(row.received_qty) || 0) *
        (Number(row.landed_rate) || 0),
    })),
  },
}),
  
  columns: [
    col('name', 'Receipt No'),
    col('purchase_order', 'PO No'),
    col('vendor', 'Vendor'),
    col('posting_date', 'Receipt Date', 'date'),
    col('supplier_delivery_note', 'Delivery Note'),
    col('total_qty', 'Received Qty', 'number'),
    col('total_amount', 'Total Value', 'currency'),
    { field: 'status', label: 'Status', type: 'receipt-status' },
  ],
  rowActions: [
    {
      key: 'cancel',
      label: 'Cancel & Reverse',
      show: (r) => r.status === 'Confirmed',
      run: async (r) => {
        const ok = window.confirm(`Cancel Goods Receipt ${r.name}? This will REVERSE the stock added to Raw inventory.`);
        if (!ok) return `Goods Receipt ${r.name} not cancelled.`;
        await call('clssurya.api.cancel_goods_receipt', { goods_receipt_name: r.name });
        return `Goods Receipt ${r.name} cancelled — stock reversed.`;
      },
    },
    {
      key: 'download_pdf',
      label: 'Download PDF',
      show: () => true,
      variant: 'contained',
      sx: { bgcolor: '#1b5e20', color: '#fff', '&:hover': { bgcolor: '#2e7d32' }, fontWeight: 700, fontSize: '0.72rem', px: 1.2, py: 0.4, mr: 0.5 },
      run: async (r) => {
        const fullDoc = await getDoc('Goods Receipt', r.name);
        await generateGoodsReceiptPDF(fullDoc || r);
        return `PDF generated for ${r.name}`;
      },
    },
  ],
};

const inventory = {
  doctype: 'Inventory', title: 'Stock', plural: 'Inventory by stage', readOnlyList: true, subtitle: 'Quantity and weighted-average price per product and stage.',
  fields: [], columns: [col('product', 'Product'), col('stage', 'Stage'), col('stock', 'Stock', 'number'), col('unit_price', 'Unit price', 'currency'), col('total_amount', 'Value', 'currency')],
};

const cncMachine = {
  doctype: 'CNC Machine',
  master: true,
  title: 'CNC Machine',
  plural: 'CNC Machines',
  subtitle: 'Master catalog of CNC machines, operation specs, and running status.',
  fields: [
    t('machine_code', 'Machine Code', { required: true, readOnlyOnEdit: true }),
    t('machine_name', 'Machine Name', { required: true }),
    sel('machine_type', 'Machine Type', ['Milling', 'Lathe', 'Drilling', 'Grinding', 'Turning', 'Other'], { required: true, default: () => 'Milling' }),
    sel('status', 'Status', ['Active', 'Inactive', 'Maintenance'], { required: true, default: () => 'Active' }),
    { name: 'description', label: 'Description', type: 'textarea' },
  ],
  columns: [
    col('machine_code', 'Machine Code'),
    col('machine_name', 'Machine Name'),
    col('machine_type', 'Machine Type'),
    col('status', 'Status'),
    col('description', 'Description'),
  ],
};

const shortageClaim = {
  doctype: 'Purchase Shortage Claim',
  title: 'Shortage & Credit Claim',
  plural: 'Shortage & Credit Claims',
  subtitle: 'Claims for short-received goods against supplier purchase entries.',
  fields: [
    link('purchase_entry', 'Purchase Entry', 'Purchase Entry', { required: true }),
    link('vendor', 'Vendor', 'Vendor', { required: true }),
    link('product', 'Product', 'Product', { required: true }),
    num('invoiced_qty', 'Invoiced Qty', { required: true }),
    num('received_qty', 'Received Qty', { required: true }),
    num('shortage_qty', 'Shortage Qty', { required: true }),
    cur('purchase_rate', 'Purchase Rate', { required: true }),
    cur('shortage_value', 'Shortage Value', { required: true }),
    cur('claimed_amount', 'Claimed Amount'),
    cur('credited_amount', 'Credited Amount'),
    t('supplier_credit_note_no', 'Supplier Credit Note #'),
    date('credit_note_date', 'Credit Note Date'),
    sel('claim_status', 'Claim Status', ['Pending', 'Submitted', 'Partially Credited', 'Fully Credited', 'Rejected', 'Settled']),
    { name: 'reason', label: 'Reason / Discrepancy details', type: 'textarea' },
  ],
  columns: [
    col('name', 'Claim ID'),
    col('purchase_entry', 'Purchase Entry'),
    col('vendor', 'Supplier'),
    col('product', 'Product'),
    col('shortage_qty', 'Shortage Qty', 'number'),
    col('shortage_value', 'Shortage Value', 'currency'),
    col('credited_amount', 'Credited', 'currency'),
    col('claim_status', 'Status'),
  ],
};

/** Route path -> config. */
export const RESOURCES = {
  '/uom': uom, '/product': product, '/category': category, '/process': process, '/purchase': purchase,
  '/quotation': quotation, '/sales-order': salesOrder, '/vendor': vendor, '/customer': customer,
  '/charge': charge, '/dispatch': dispatch, '/customer-return': customerReturn, '/goods-receipt': goodsReceipt,
  '/cnc-machine': cncMachine, '/shortage-claim': shortageClaim,
};