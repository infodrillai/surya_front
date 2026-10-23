/**
 * One config per screen. CrudPage + DocForm turn these into list, form, validation and live maths.
 * @typedef {{name:string,label:string,type?:string,master?:string,doctype?:string,filter?:Function,required?:boolean,
 *   readOnly?:boolean,readOnlyOnEdit?:boolean,summary?:boolean,positive?:boolean,showIf?:Function,options?:string[]}} FieldConfig
 */
import React from 'react';
import { LinearProgress, Stack, Typography, Chip } from '@mui/material';
import { call, deleteDoc, getDoc, insertDoc, runAction, updateDoc } from '../api/client';
import { db } from '../db/dexie';
import { purchaseCalc, salesCalc, stageCalc, computeQuotationPR } from '../lib/formulas';
import QtyDialog from '../components/QtyDialog';
import { todayISO } from '../lib/format';

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
const customerCols = [col('name', 'Name'), col('gstin', 'GSTIN'), col('city', 'City'), col('phone', 'Phone'), col('total_outstanding', 'Outstanding', 'currency')];

const uom = { ...simple('UOM', 'uom_name', 'UOM'), plural: 'Units of measure' };
const process = { ...simple('Process', 'process_name', 'Process'), plural: 'Processes' };
const category = { ...simple('Category', 'category_name', 'Category'), plural: 'Categories' };
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
    t('phone', 'Phone'),
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
// The BOM is no longer a separate screen: it is saved as the product's own BOM document.
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
    sel('product_type', 'Product type', ['Raw', 'Semi', 'Finished'], { required: true, default: () => 'Raw' }),
    link('uom', 'UOM', 'UOM', { required: true }),
    link('category', 'Category', 'Category'),
    sel('total_steps', 'BOM Stages (Total steps)', [
      { value: 1, label: '1 Stage (Stage 1 only)' },
      { value: 2, label: '2 Stages (Stage 1 & 2)' },
      { value: 3, label: '3 Stages (Stage 1, 2 & 3)' },
    ], {
      showIf: (v) => v.product_type && v.product_type !== 'Raw',
      default: () => 3,
    }),
    num('low_stock_limit', 'Low stock limit'),
    num('high_stock_limit', 'High stock limit'),
    { name: 'is_scrap', label: 'Scrap / wastage product', type: 'check' },
    { name: 'allow_negative_stock', label: 'Allow negative stock', type: 'check' },
  ],
  tables: [
    {
      name: 'stage1_items',
      label: 'BOM · Stage 1 (Raw materials & Scrap)',
      empty: 'Add Stage 1 raw materials and optional scrap/wastage product.',
      fields: bomRow([link('wastage_product', 'Wastage scrap product', 'Product', { filter: (r) => !!r.is_scrap, minWidth: 200 })]),
      showIf: (v) => steps(v) >= 1,
      newRow: () => ({ per_unit_utilization: '' }),
    },
    {
      name: 'stage2_items',
      label: 'BOM · Stage 2 (Secondary raw materials)',
      empty: 'Add Stage 2 raw materials.',
      fields: bomRow(),
      showIf: (v) => steps(v) >= 2,
      newRow: () => ({ per_unit_utilization: '' }),
    },
    {
      name: 'stage3_charges',
      label: 'BOM · Stage 3 (Charges & Overhead)',
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
    col('product_name', 'Name'),
    col('product_type', 'Type'),
    col('uom', 'UOM'),
    col('category', 'Category'),
    col('total_steps', 'Steps', 'number'),
  ],
};

// ---- Purchase --------------------------------------------------------------
const purchase = {
  doctype: 'Purchase Entry', title: 'Purchase', plural: 'Purchases', completable: true, subtitle: 'Vendor bills. Completing a purchase adds Raw stock at landed cost.',
  fields: [
    link('vendor', 'Vendor', 'Vendor', { required: true }), date('posting_date', 'Date', { required: true }), t('bill_no', 'Bill no', { required: true }), ro(t('vendor_state', 'Vendor state')),
    cur('extra_charges', 'Extra charges', { required: false, default: () => 0 }),
    sum(cur('taxable_amount', 'Taxable amount')), sum(cur('tax_amount', 'Tax amount', { required: false, default: () => 0 })), sum(cur('grand_total', 'Grand total')),
  ],
  tables: [{
    name: 'items', label: 'Items', newRow: () => ({ quantity: '', rate: '', gst_percent: 0, extra_charge: 0, cgst: 0, sgst: 0, igst: 0, amount: 0, landed_rate: 0 }), empty: 'Add the raw materials on this bill.',
    fields: [link('product', 'Product', 'Product', { filter: raw, required: true, minWidth: 220, labelField: 'product_name' }), num('quantity', 'Qty', { positive: true }), ro(t('uom', 'UOM')), cur('rate', 'Rate'), num('gst_percent', 'GST %', { max: 100 }), cur('extra_charge', 'Extra charge'), ro(cur('amount', 'Amount')), ro(cur('cgst', 'CGST')), ro(cur('sgst', 'SGST')), ro(cur('igst', 'IGST')), ro(cur('landed_rate', 'Landed rate', { dp: 4 }))],
  }],
  compute: (v, ctx) => purchaseCalc(v, ctx),
  validate: (v) => (v.items?.length ? {} : { items: 'Add at least one item' }),
  columns: [col('name', 'No'), col('vendor', 'Vendor'), col('posting_date', 'Date', 'date'), col('bill_no', 'Bill no'), col('extra_charges', 'Extra charges'), col('grand_total', 'Grand total', 'currency'), status],
};

// ---- Stage batches ---------------------------------------------------------
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
const stageConfig = (stage) => ({
  doctype: `Stage ${stage} Batch`, title: `Stage ${stage} batch`, plural: `Stage ${stage} batches`, completable: true, summaryTitle: 'Live cost',
  fields: [
    link('product', stage === 3 ? 'Finished product' : 'Product to produce', 'Product', { required: true, minWidth: 240, filter: (r) => r.product_type !== 'Raw' && Number(r.total_steps) >= stage }),
    num('quantity', 'Quantity produced', { positive: true }), date('posting_date', 'Date'),
    ...(stage === 1 ? [num('weight_per_piece', 'Weight per piece', { positive: true }), ro(num('wastage_qty', 'Wastage (to scrap)', { dp: 4 }))] : []),
    // Stage 3: tooling % is typed by hand and works on carried cost + the charges ticked "In tooling base"
    ...(stage === 3 ? [num('tooling_percent', 'Tooling cost %', { max: 100 }), ro(cur('tooling_base', 'Tooling base (carried + ticked charges)', { minWidth: 220 }))] : []),
    num('rejection_percent', stage === 3 ? 'Rejection % (on everything)' : 'Rejection %', { max: 99.99 }),
    sum(cur('carried_cost', 'Carried cost')), sum(cur('added_cost', 'Added cost')),
    ...(stage === 3 ? [sum(cur('tooling_amount', 'Tooling cost'))] : []),
    sum(cur('rejection_amount', 'Rejection')), sum(cur('batch_total', 'Batch total')), sum(cur('unit_cost', 'Unit cost', { dp: 3 })),
  ],
  tables: [
    { name: 'items', label: stage === 1 ? 'Raw materials' : stage === 2 ? 'Consumption (carried-in + raw)' : 'Carried-in Stage 2 stock', fields: itemFields, noAdd: true },
    ...(stage === 3 ? [{ name: 'charges', label: 'Charges', noAdd: true, fields: [link('charge', 'Charge', 'Charge', { readOnly: true }), cur('per_unit_price', 'Per unit'), { name: 'in_tooling_base', label: 'In tooling base', type: 'check' }, ro(cur('amount', 'Amount'))] }] : []),
  ],

  // one calculation, shared with the tests (extra cost, tooling and rejection are all inside stageCalc)
  compute: (v) => stageCalc(stage, v),

  loadKey: (v) => (v.product && Number(v.quantity) > 0 ? `${v.product}|${v.quantity}` : null),
  loadRows: stageRows(stage),
  columns: [col('name', 'No'), col('product', 'Product'), col('quantity', 'Quantity', 'number'), col('unit_cost', 'Unit cost', 'currency'), col('batch_total', 'Batch total', 'currency'), status],
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
// Rate is READ-ONLY and auto-derived: Rate = Cost/unit × (1 + PR%)
// Amount = Qty × Rate
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

    // ---- Summary section (order = display order) ----
    sum(cur('subtotal', 'Subtotal')),
    { ...num('discount_percent', 'Discount (%)', { max: 100 }), summary: true },  // editable
    sum(cur('discount_amount', 'Discount Amount')),
    //sum(cur('taxable_amount', 'Taxable Amount')),
    { ...num('gst_percent', 'GST (%)', { max: 100 }), summary: true },            // editable
    sum(cur('tax_amount', 'GST Amount')),
    sum(cur('grand_total', 'Grand Total')),
  ],

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
    const discountAmt = subtotal * discountPct / 100;
    const taxableAmt = Math.max(0, subtotal - discountAmt);
    const gstPct = Math.min(100, Math.max(0, Number(v.gst_percent) || 0));
    const taxAmt = taxableAmt * gstPct / 100;

    return {
      top: {
        ...base.top,
        subtotal,
        discount_amount: discountAmt,
        taxable_amount: taxableAmt,
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
    col('total_amount', 'Grand total', 'currency'),
    col('status', 'Status', 'status'),
  ],


  rowActions: [
    {
      key: 'revise',
      label: 'Revise',
      show: (r) => r.status !== 'Superseded',
      run: async (r) =>
        `Created ${(await runAction('Quotation', r.name, 'revise')).result}`
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
    return `Dispatch ${result?.name ?? result?.result ?? ''} created for ${orderId}`;
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
    sum(cur('total_amount', 'Total'))
  ],

  tables: [{
    name: 'items',
    label: 'Items',
    fields: [
      ...salesRow.slice(0, 5),
      ro(cur('final_rate', 'Final rate', { dp: 4 })),
      ro(cur('amount', 'Amount')),
      ro(num('dispatched_qty', 'Dispatched')),
      ro(num('pending_qty', 'Pending')),
    ],
    newRow: () => ({ quantity: '', pr: 0, rate: '' }),
  }],

  compute: (v, ctx) => salesCalc(v, ctx),
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
    col('total_amount', 'Total', 'currency'),
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
          return 'No pending items to dispatch.';
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
  ],
};

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
      // Show only for Draft dispatches (not yet confirmed/cancelled)
      show: (r) => r.dispatch_status === 'Draft' || r.dispatch_status === 'Pending',
      run: async (r) => {
        const ok = window.confirm(
          `Confirm Dispatch ${r.name}? This will deduct stock and cannot be undone.`
        );
        if (!ok) return `Dispatch ${r.name} not confirmed.`;
        await runAction('Dispatch', r.name, 'confirm_dispatch');
        return `Dispatch ${r.name} confirmed — stock deducted.`;
      },
    },
    {
      key: 'cancel',
      label: 'Cancel',
      // Show only for Draft/Pending dispatches
      show: (r) => r.dispatch_status === 'Draft' || r.dispatch_status === 'Pending',
      run: async (r) => {
        const ok = window.confirm(
          `Cancel Dispatch ${r.name}? This will not affect inventory.`
        );
        if (!ok) return `Dispatch ${r.name} not cancelled.`;
        await runAction('Dispatch', r.name, 'cancel_dispatch');
        return `Dispatch ${r.name} cancelled.`;
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
    {
      field: 'dispatch_status',
      label: 'Status',
      type: 'custom',
      render: (r) => {
        const statusColors = {
          Draft: 'default',
          Pending: 'warning',
          Dispatched: 'success',
          Completed: 'success',
          Cancelled: 'error',
          'Partially Dispatched': 'info',
        };
        return (
          <Chip
            size="small"
            label={r.dispatch_status || 'Draft'}
            color={statusColors[r.dispatch_status] || 'default'}
          />
        );
      },
    },
  ],
};

const inventory = {
  doctype: 'Inventory', title: 'Stock', plural: 'Inventory by stage', readOnlyList: true, subtitle: 'Quantity and weighted-average price per product and stage.',
  fields: [], columns: [col('product', 'Product'), col('stage', 'Stage'), col('stock', 'Stock', 'number'), col('unit_price', 'Unit price', 'currency'), col('total_amount', 'Value', 'currency')],
};

/** Route path -> config. */
export const RESOURCES = {
  '/uom': uom, '/product': product, '/category': category, '/process': process, '/purchase': purchase,
  '/quotation': quotation, '/sales-order': salesOrder, '/vendor': vendor, '/customer': customer,
  '/charge': charge, '/dispatch': dispatch,
};