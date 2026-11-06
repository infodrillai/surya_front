import React from 'react';
import { Box, Button, Chip } from '@mui/material';
import { call, runAction, getDoc, updateDoc } from '../api/client';
import { db } from '../db/dexie';
import { todayISO } from '../lib/format';
import {
  beltBatchCalc,
  beltStageCalc,
  beltStageRows,
  loadBeltBatchRows,
  BELT_TYPES,
  BELT_PROCESSES,
  BELT_STAGE_LABELS,
} from '../lib/beltBatchLogic';

const t = (name, label, x = {}) => ({ name, label, type: 'text', ...x });
const num = (name, label, x = {}) => ({ name, label, type: 'number', ...x });
const cur = (name, label, x = {}) => ({ name, label, type: 'currency', ...x });
const date = (name, label, x = {}) => ({ name, label, type: 'date', default: todayISO, ...x });
const link = (name, label, master, x = {}) => ({ name, label, type: 'link', master, ...x });
const sel = (name, label, options, x = {}) => ({ name, label, type: 'select', options, ...x });
const ro = (f) => ({ ...f, readOnly: true });
const sum = (f) => ({ ...f, readOnly: true, summary: true, default: () => 0 });
const col = (field, label, type) => ({ field, label, type });
const status = { field: 'is_completed', label: 'Status', type: 'doc-status' };

const BELT_STAGE_TITLES = {
  1: 'Stage 1 (Roll creation) batch',
  2: 'Stage 2 (Roll Sizing) batch',
  3: 'Stage 3 (Roll Finished) batch',
  4: 'Stage 4 (Charges) batch',
};

const BELT_STAGE_PLURALS = {
  1: 'Stage 1 (Roll creation) batches',
  2: 'Stage 2 (Roll Sizing) batches',
  3: 'Stage 3 (Roll Finished) batches',
  4: 'Stage 4 (Charges) batches',
};

const beltItemFields = (stage) => [
  link('process', 'Process', 'Process', { readOnly: true }),
  link('product', 'Product', 'Product', { readOnly: true, minWidth: 200 }),
  ro(num('per_unit_utilization', 'Per unit', { dp: 5 })),
  ro(num('total_utilization', 'Estimate', { dp: 5 })),
  num('actual_utilization', 'Actual used'),
  cur('unit_price', 'Unit price', { dp: 4, positive: true }),
  ro(cur('actual_amount', 'Actual amount')),
  cur('extra_cost', 'Extra cost / pc'),
];

/**
 * Process-specific Stage Config matching PU Batch format exactly
 * @param {1|2|3|4} stage
 */
export const beltStageConfig = (stage) => ({
  doctype: 'Belt Batch',
  title: BELT_STAGE_TITLES[stage] || `Stage ${stage} batch`,
  plural: BELT_STAGE_PLURALS[stage] || `Stage ${stage} batches`,
  completable: true,
  runAction: async (name, action, docValues) => {
    if (action === 'complete') {
      const result = await updateDoc('Belt Batch', name, { is_completed: 1 });
      // After completing a belt batch, call the backend to update inventory for this stage.
      // This mirrors what the PU batch backend does automatically.
      try {
        await call('clssurya.api.run_action', {
          doctype: 'Belt Batch',
          name,
          action: 'update_inventory',
          args: {},
        });
      } catch (_) {
        // update_inventory may not exist yet on backend — fail silently.
        // The inventory will be updated when the backend processes is_completed=1.
      }
      return result;
    }
    if (action === 'reopen') {
      return await updateDoc('Belt Batch', name, { is_completed: 0 });
    }
    return await runAction('Belt Batch', name, action);
  },
  summaryTitle: 'Live cost',
  filter: { process_step: stage },
  filterRows: (r) => (Number(r.stage || r.process_step) || 1) === stage,
  newDoc: () => ({ stage, process_step: stage, current_process: BELT_STAGE_LABELS[stage] }),
  transformRows: (allRows) =>
    allRows.filter((r) => (Number(r.stage || r.process_step) || 1) === stage),
  beforeSave: (payload) => {
    const clean = {
      stage,
      process_step: stage,
      current_process: BELT_STAGE_LABELS[stage],
      ...payload,
    };
    if (clean.items) {
      clean.items = clean.items.map((row) => ({
        ...row,
        process: '', // Clear non-existent process link to satisfy Frappe foreign-key Link validation
        product: row.is_carried_in ? (clean.product || row.product) : row.product,
      }));
    }
    return clean;
  },

  fields: [
    num('stage', 'Stage', { default: () => stage, hidden: true }),
    num('process_step', 'Process Step', { default: () => stage, hidden: true }),
    t('current_process', 'Current Process', { default: () => BELT_STAGE_LABELS[stage], hidden: true }),
    link('product', stage === 4 ? 'Finished belt product' : 'Belt product to produce', 'Product', {
      required: true,
      minWidth: 240,
      filter: (r) => (r.product_type === 'Finished' || r.product_type === 'Semi') && r.finished_good_type === 'Belt',
      onChange: async (row, { values, setValue }) => {
        if (!values.product) return;
        try {
          const p = (await db.table('Product').get(values.product)) || (await getDoc('Product', values.product));
          if (p) {
            setValue('belt_type', p.belt_type || 'Grommed');
            setValue('length', p.belt_length !== undefined && p.belt_length !== null ? p.belt_length : '');
            setValue('width', p.belt_width !== undefined && p.belt_width !== null ? p.belt_width : '');
            setValue('holes', p.hole !== undefined && p.hole !== null ? p.hole : '');
            if (p.size !== undefined && p.size !== null) setValue('size', p.size);
            setValue('ratio', p.ratio || 1);
            setValue('total_processes', Number(p.total_processes) || 4);
          }
        } catch (_) { }
      },
    }),
    num('quantity', 'Quantity produced', { positive: true }),
    date('posting_date', 'Date'),
    ...(stage === 2 ? [num('size', 'Size')] : []),
    ...(stage === 2 ? [num('length', 'Length')] : []),
    ...(stage === 2 ? [num('width', 'Width')] : []),
    ...(stage === 2 ? [num('holes', 'Hole')] : []),
    num('rejection_percent', 'Rejection %', { max: 99.99 }),
    sum(cur('carried_cost', 'Carried cost')),
    sum(cur('added_cost', 'Added cost')),
    ...(stage === 4 ? [sum(cur('charge_total', 'Charges'))] : []),
    sum(cur('rejection_amount', 'Rejection')),
    sum(cur('batch_total', 'Batch total')),
    sum(cur('unit_cost', 'Unit cost', { dp: 3 })),
    t('remarks', 'Remarks'),
  ],

  tables: [
    {
      name: 'items',
      label:
        stage === 1
          ? 'Roll Creation Materials'
          : stage === 2
            ? 'Roll Sizing Materials'
            : stage === 3
              ? 'Roll Finished Materials'
              : 'Charges & finishing items',
      fields: beltItemFields(stage),
      noAdd: false,
    },
    ...(stage === 4
      ? [
        {
          name: 'charges',
          label: 'Charges',
          noAdd: false,
          fields: [
            link('charge', 'Charge', 'Charge', { readOnly: true }),
            cur('per_unit_price', 'Per unit'),
            sel('calculation_basis', 'Basis', ['Per Piece', 'Per Meter', 'Fixed']),
            ro(cur('amount', 'Amount')),
          ],
        },
      ]
      : []),
  ],

  compute: (v) => beltStageCalc(stage, v),
  loadKey: (v) =>
    v.product && Number(v.quantity) > 0 ? `${v.product}|${v.quantity}|${v.size || ''}|${stage}` : null,
  loadRows: beltStageRows(stage),
  columns: [
    col('name', 'Batch No'),
    col('product', 'Product'),
    col('quantity', 'Quantity', 'number'),
    col('unit_cost', 'Unit cost', 'currency'),
    col('batch_total', 'Batch total', 'currency'),
    status,
  ],
  validate: (v) => {
    const e = {};
    const numFields = ['quantity', 'rejection_percent'];
    numFields.forEach((f) => {
      if (v[f] !== undefined && isNaN(Number(v[f]))) {
        e[f] = 'Expected number, received NaN';
      }
    });
    return e;
  },
});

export const BELT_STAGE_CONFIGS = [
  beltStageConfig(1),
  beltStageConfig(2),
  beltStageConfig(3),
  beltStageConfig(4),
];

// Fallback config for unified routing
export const beltBatchConfig = BELT_STAGE_CONFIGS[0];
