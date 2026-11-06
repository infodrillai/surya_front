/**
 * Belt Batch Manufacturing Module Logic & Formulas
 * CL Surya ERP
 */
import { call, getDoc, getList } from '../api/client';
import { db } from '../db/dexie';
import {
  beltBatchCalc,
  calculateBeltComponents,
  calculateProductionQtyFromRoll,
  calculateRequiredRoll,
  getBeltDivisionFactor,
  n,
} from './formulas';

export {
  beltBatchCalc,
  calculateBeltComponents,
  calculateProductionQtyFromRoll,
  calculateRequiredRoll,
  getBeltDivisionFactor,
};

let _poRatesCache = null;
let _poRatesCacheTime = 0;
let _poRatesFetchPromise = null;
export const _latestStageUnitCosts = { 1: 0, 2: 0, 3: 0 };

/**
 * Fetch the actual unit cost from the completed or latest batch of the previous stage.
 * E.g., for Stage 2, fetches Stage 1 unit cost (e.g. 3.49) instead of hardcoded 65.
 */
export async function getPreviousStageUnitCost(prevStage, productName) {
  const fallbackRate = prevStage === 1 ? 65 : prevStage === 2 ? 110 : 135;
  try {
    const batches = await getList('Belt Batch');
    if (Array.isArray(batches) && batches.length > 0) {
      // Find batches matching the previous stage
      const prevBatches = batches.filter((b) => {
        const s = Number(b.stage || b.process_step) || (b.name?.startsWith(`BB-${prevStage}-`) ? prevStage : 0);
        return s === prevStage;
      });

      if (prevBatches.length > 0) {
        // Sort newest first
        prevBatches.sort((a, b) => String(b.modified || b.name || '').localeCompare(String(a.modified || a.name || '')));

        // 1. Try to find batch with the same product and unit_cost > 0
        const matchWithProduct = prevBatches.find((b) => {
          const cost = Number(b.unit_cost) || (Number(b.quantity) > 0 ? Number(b.batch_total) / Number(b.quantity) : 0);
          return (b.product === productName || !productName) && cost > 0;
        });

        // 2. Fallback to any batch from prevStage with unit_cost > 0
        const matchAny = prevBatches.find((b) => {
          const cost = Number(b.unit_cost) || (Number(b.quantity) > 0 ? Number(b.batch_total) / Number(b.quantity) : 0);
          return cost > 0;
        });

        const selected = matchWithProduct || matchAny;
        if (selected) {
          const cost = Number(selected.unit_cost) ||
            (Number(selected.quantity) > 0 ? Number(selected.batch_total) / Number(selected.quantity) : 0);
          if (cost > 0) {
            _latestStageUnitCosts[prevStage] = cost;
            return cost;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not fetch previous stage batch cost:', err);
  }
  return _latestStageUnitCosts[prevStage] || fallbackRate;
}

/**
 * Fetch latest purchase order rates for raw materials / products from Purchase Entry (PO)
 * Cached with a 30s TTL to prevent repeated API calls.
 */
export async function fetchPurchaseOrderRates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _poRatesCache && now - _poRatesCacheTime < 30000) {
    return _poRatesCache;
  }
  if (_poRatesFetchPromise) return _poRatesFetchPromise;

  _poRatesFetchPromise = (async () => {
    const rateMap = {};
    try {
      let allProducts = [];
      try { allProducts = await db.table('Product').toArray(); } catch (_) {}

      const mapProductRate = (prod, r) => {
        if (!prod || r <= 0) return;
        if (rateMap[prod] === undefined) rateMap[prod] = r;
        const matched = allProducts.find(
          (x) =>
            x.name === prod ||
            x.product_code === prod ||
            x.product_name === prod ||
            (x.product_code && String(x.product_code).toLowerCase() === String(prod).toLowerCase()) ||
            (x.name && String(x.name).toLowerCase() === String(prod).toLowerCase())
        );
        if (matched) {
          if (matched.name && rateMap[matched.name] === undefined) rateMap[matched.name] = r;
          if (matched.product_code && rateMap[matched.product_code] === undefined) rateMap[matched.product_code] = r;
          if (matched.product_name && rateMap[matched.product_name] === undefined) rateMap[matched.product_name] = r;
        }
      };

      // 1. Query recent Purchase Entry records and inspect child items
      try {
        const poList = await getList('Purchase Entry', {
          fields: ['name', 'posting_date', 'status'],
          orderBy: 'posting_date desc, modified desc',
        });

        if (Array.isArray(poList) && poList.length > 0) {
          const activePoList = poList.filter((p) => p.status !== 'Cancelled').slice(0, 50);
          await Promise.all(
            activePoList.map(async (po) => {
              try {
                const fullDoc = await getDoc('Purchase Entry', po.name);
                const docItems = fullDoc?.items || fullDoc?.purchase_entry_item || [];
                docItems.forEach((it) => {
                  const prod = it.product;
                  const r = Number(it.landed_rate || it.rate) || 0;
                  mapProductRate(prod, r);
                });
              } catch (_) {}
            })
          );
        }
      } catch (listErr) {
        console.warn('[PO Rates] Purchase Entry list failed:', listErr?.message || listErr);
      }

      // 2. Query Goods Receipt for confirmed receipts with latest landed rates
      try {
        const grList = await getList('Goods Receipt', {
          fields: ['name', 'posting_date', 'status'],
          filters: { status: 'Confirmed' },
          orderBy: 'posting_date desc, modified desc',
        });

        if (Array.isArray(grList) && grList.length > 0) {
          const recentGr = grList.slice(0, 30);
          await Promise.all(
            recentGr.map(async (gr) => {
              try {
                const fullDoc = await getDoc('Goods Receipt', gr.name);
                const docItems = fullDoc?.items || [];
                docItems.forEach((it) => {
                  const prod = it.product;
                  const r = Number(it.landed_rate || it.rate) || 0;
                  mapProductRate(prod, r);
                });
              } catch (_) {}
            })
          );
        }
      } catch (_) {}
    } catch (err) {
      console.warn('[PO Rates] Error fetching purchase order rates:', err);
    }

    console.log('[PO Rates] Final rate map:', rateMap);
    _poRatesCache = rateMap;
    _poRatesCacheTime = Date.now();
    _poRatesFetchPromise = null;
    return rateMap;
  })();

  return _poRatesFetchPromise;
}

/**
 * Get latest purchase unit cost for a product from Purchase Order / Inventory / Batches / Product master
 */
export async function getProductPurchaseRate(productName) {
  if (!productName) return 0;

  let allProducts = [];
  try { allProducts = await db.table('Product').toArray(); } catch (_) {}
  const p = allProducts.find((x) =>
    x.name === productName ||
    x.product_code === productName ||
    x.product_name === productName ||
    (x.product_code && String(x.product_code).toLowerCase() === String(productName).toLowerCase()) ||
    (x.name && String(x.name).toLowerCase() === String(productName).toLowerCase())
  );

  // 1. Check Purchase Entry / Goods Receipt rates with alias matching
  try {
    const rates = await fetchPurchaseOrderRates();
    if (rates) {
      if (rates[productName] > 0) return rates[productName];
      if (p?.name && rates[p.name] > 0) return rates[p.name];
      if (p?.product_code && rates[p.product_code] > 0) return rates[p.product_code];
      if (p?.product_name && rates[p.product_name] > 0) return rates[p.product_name];

      // Case-insensitive check
      const lowerKey = String(productName).toLowerCase();
      const matchedKey = Object.keys(rates).find((k) => k.toLowerCase() === lowerKey);
      if (matchedKey && rates[matchedKey] > 0) return rates[matchedKey];
    }
  } catch (_) {}

  // 2. Check if produced in a previous Belt Batch (e.g., Stage 1 Roll Creation Batch)
  try {
    const batches = await getList('Belt Batch');
    if (Array.isArray(batches) && batches.length > 0) {
      const matchBatch = batches.find((b) => {
        const cost = Number(b.unit_cost) || (Number(b.quantity) > 0 ? Number(b.batch_total) / Number(b.quantity) : 0);
        return (
          cost > 0 &&
          (b.product === productName ||
           (p && (b.product === p.name || b.product === p.product_code || b.product === p.product_name)))
        );
      });
      if (matchBatch) {
        const cost = Number(matchBatch.unit_cost) ||
          (Number(matchBatch.quantity) > 0 ? Number(matchBatch.batch_total) / Number(matchBatch.quantity) : 0);
        if (cost > 0) {
          console.log('[PO Rates] Resolved unit cost from Belt Batch for', productName, cost);
          return cost;
        }
      }
    }
  } catch (_) {}

  // 3. Check Inventory table (actual unit cost in stock)
  try {
    const invRows = await getList('Inventory', {
      fields: ['product', 'unit_price', 'stock'],
    });
    if (Array.isArray(invRows) && invRows.length > 0) {
      const invMatch = invRows.find((i) =>
        Number(i.unit_price) > 0 &&
        (i.product === productName ||
         (p && (i.product === p.name || i.product === p.product_code || i.product === p.product_name)))
      );
      if (invMatch && Number(invMatch.unit_price) > 0) {
        const cost = Number(invMatch.unit_price);
        console.log('[PO Rates] Resolved unit cost from Inventory for', productName, cost);
        return cost;
      }
    }
  } catch (_) {}

  // 4. Fallback to Product master rates
  try {
    let prodDoc = p;
    if (!prodDoc) {
      try { prodDoc = await getDoc('Product', productName); } catch (_) {}
    }
    if (prodDoc) {
      const r = Number(
        prodDoc.last_purchase_rate ||
        prodDoc.purchase_rate ||
        prodDoc.standard_rate ||
        prodDoc.valuation_rate ||
        prodDoc.unit_price ||
        prodDoc.rate
      ) || 0;
      if (r > 0) return r;
    }
  } catch (_) {}

  return 0;
}

/**
 * Check if a batch item is Fabric / measured in meters.
 * Non-fabric items in Stage 1 have per_unit in grams and are converted to kg (/ 1000).
 */
export function isFabricItem(product, uom) {
  if (!product && !uom) return true;
  const p = String(product || '').toLowerCase();
  const u = String(uom || '').toLowerCase();
  if (u.includes('meter') || u === 'mtr' || u === 'm') return true;
  if (p.includes('fabric') || p.includes('roll')) return true;
  return false;
}

export const BELT_TYPES = [
  'Grommed with Aluminium Patti',
  'Grommed Band',
  'Upper Belt',
  'Lower Belt',
  'Grommed',
  'Standard Belt',
  'Custom Belt',
];

export const BELT_PROCESSES = [
  { step: 1, key: 'roll_creation', label: 'Stage 1: Roll Creation', shortLabel: 'Roll Creation' },
  { step: 2, key: 'belt_sizing', label: 'Stage 2: Belt Sizing', shortLabel: 'Belt Sizing' },
  { step: 3, key: 'belt_finishing', label: 'Stage 3: Belt Finishing', shortLabel: 'Belt Finishing' },
  { step: 4, key: 'charges', label: 'Stage 4: Charges', shortLabel: 'Charges' },
];

/**
 * Get the effective processes applicable to a product based on its total_processes (2, 3, or 4)
 * @param {number} totalProcesses 
 */
export function getProductBeltProcesses(totalProcesses = 4) {
  const tp = Math.max(2, Math.min(4, Number(totalProcesses) || 4));
  return BELT_PROCESSES.slice(0, tp);
}

/**
 * Determine if a specific process step is active for the product
 * @param {number} step (1..4)
 * @param {number} totalProcesses (2..4)
 */
export function isProcessApplicable(step, totalProcesses = 4) {
  const tp = Math.max(2, Math.min(4, Number(totalProcesses) || 4));
  return step <= tp;
}

/**
 * Load BOM rows & charge rows for a Belt product based on product master and quantity
 * @param {object} values 
 */
export async function loadBeltBatchRows(values) {
  const productName = values.product;
  if (!productName) return { tables: {}, top: {} };

  let product = null;
  try {
    product = await db.table('Product').get(productName);
  } catch (_) {
    // If offline or not in dexie, fallback to API
  }

  const length = n(values.length || product?.belt_length);
  const width = n(values.width || product?.belt_width);
  const factor = getBeltDivisionFactor(width, values.roll_division_factor || product?.roll_division_factor);
  const holes = n(values.holes || product?.hole);
  const qty = n(values.planned_quantity || values.quantity || 100);
  const totalProcesses = Number(values.total_processes || product?.total_processes || 4);

  // Calculate required roll
  const rollCalc = calculateRequiredRoll({ length, quantity: qty, width, divisionFactor: factor });
  const rollMeters = rollCalc.rollMeters;

  // Components calculation
  const components = calculateBeltComponents({ quantity: qty, holes });

  // Standard or configured Belt items
  const items = [
    // Process 1: Roll Material
    {
      process: 'Process 1: Roll Creation',
      product: 'Fabric Roll Material',
      component_type: 'Roll Material',
      formula: 'roll',
      uom: 'Meter',
      per_unit_utilization: factor > 0 ? (length / 1000) / factor : 0,
      total_utilization: rollMeters,
      actual_utilization: rollMeters,
      unit_price: 150,
      actual_amount: rollMeters * 150,
      is_carried_in: false,
    },
    // Process 2: Belt Sizing Materials & Components
    {
      process: 'Process 2: Belt Sizing',
      product: 'Nylon Sheet',
      component_type: 'Nylon Sheet',
      formula: 'sizing',
      uom: 'KG',
      per_unit_utilization: rollMeters > 0 ? (0.1538 * rollMeters) / qty : 0.015,
      total_utilization: rollMeters * 0.1538,
      actual_utilization: rollMeters * 0.1538,
      unit_price: 220,
      actual_amount: rollMeters * 0.1538 * 220,
      is_carried_in: false,
    },
    {
      process: 'Process 2: Belt Sizing',
      product: 'Bonding Solution',
      component_type: 'Bonding',
      formula: 'sizing',
      uom: 'KG',
      per_unit_utilization: rollMeters > 0 ? (0.0435 * rollMeters) / qty : 0.005,
      total_utilization: rollMeters * 0.0435,
      actual_utilization: rollMeters * 0.0435,
      unit_price: 350,
      actual_amount: rollMeters * 0.0435 * 350,
      is_carried_in: false,
    },
    {
      process: 'Process 2: Belt Sizing',
      product: 'Eyelets',
      component_type: 'Eyelet',
      formula: 'eyelets',
      uom: 'PCS',
      per_unit_utilization: holes * 4,
      total_utilization: components.eyelets,
      actual_utilization: components.eyelets,
      unit_price: 0.25,
      actual_amount: components.eyelets * 0.25,
      is_carried_in: false,
    },
    {
      process: 'Process 2: Belt Sizing',
      product: 'Rivets',
      component_type: 'Rivet',
      formula: 'rivets',
      uom: 'PCS',
      per_unit_utilization: holes * 4,
      total_utilization: components.rivets,
      actual_utilization: components.rivets,
      unit_price: 0.35,
      actual_amount: components.rivets * 0.35,
      is_carried_in: false,
    },
    {
      process: 'Process 2: Belt Sizing',
      product: 'Aluminium Patti',
      component_type: 'Patti',
      formula: 'aluminium_patti',
      uom: 'PCS',
      per_unit_utilization: 2,
      total_utilization: components.aluminiumPatti,
      actual_utilization: components.aluminiumPatti,
      unit_price: 8.50,
      actual_amount: components.aluminiumPatti * 8.50,
      is_carried_in: false,
    },
    {
      process: 'Process 2: Belt Sizing',
      product: 'Aluminium Patti Rivets',
      component_type: 'Patti Rivet',
      formula: 'patti_rivets',
      uom: 'PCS',
      per_unit_utilization: 4,
      total_utilization: components.aluminiumPattiRivets,
      actual_utilization: components.aluminiumPattiRivets,
      unit_price: 0.40,
      actual_amount: components.aluminiumPattiRivets * 0.40,
      is_carried_in: false,
    },
  ];

  // Process 3: Finishing Materials (only if totalProcesses >= 3)
  if (totalProcesses >= 3) {
    items.push(
      {
        process: 'Process 3: Belt Finishing',
        product: 'HUB 1046M',
        component_type: 'Finishing Chemical',
        formula: 'finishing',
        uom: 'KG',
        per_unit_utilization: rollMeters > 0 ? (0.03077 * rollMeters) / qty : 0.003,
        total_utilization: rollMeters * 0.03077,
        actual_utilization: rollMeters * 0.03077,
        unit_price: 450,
        actual_amount: rollMeters * 0.03077 * 450,
        is_carried_in: false,
      },
      {
        process: 'Process 3: Belt Finishing',
        product: 'CL-501',
        component_type: 'Finishing Chemical',
        formula: 'finishing',
        uom: 'KG',
        per_unit_utilization: rollMeters > 0 ? (0.00231 * rollMeters) / qty : 0.0002,
        total_utilization: rollMeters * 0.00231,
        actual_utilization: rollMeters * 0.00231,
        unit_price: 600,
        actual_amount: rollMeters * 0.00231 * 600,
        is_carried_in: false,
      },
      {
        process: 'Process 3: Belt Finishing',
        product: 'Toluene',
        component_type: 'Solvent',
        formula: 'finishing',
        uom: 'KG',
        per_unit_utilization: rollMeters > 0 ? (0.04615 * rollMeters) / qty : 0.005,
        total_utilization: rollMeters * 0.04615,
        actual_utilization: rollMeters * 0.04615,
        unit_price: 180,
        actual_amount: rollMeters * 0.04615 * 180,
        is_carried_in: false,
      }
    );
  }

  // Process 4: Charges (only if totalProcesses === 4)
  const charges = [];
  if (totalProcesses === 4) {
    charges.push(
      {
        process: 'Process 4: Charges',
        charge: 'Labour Charges',
        rate: 12.0,
        calculation_basis: 'Per Piece',
        quantity: qty,
        amount: qty * 12.0,
      },
      {
        process: 'Process 4: Charges',
        charge: 'Bonding Charges',
        rate: 8.5,
        calculation_basis: 'Per Meter',
        quantity: rollMeters,
        amount: rollMeters * 8.5,
      },
      {
        process: 'Process 4: Charges',
        charge: 'Coating Charges',
        rate: 6.0,
        calculation_basis: 'Per Meter',
        quantity: rollMeters,
        amount: rollMeters * 6.0,
      },
      {
        process: 'Process 4: Charges',
        charge: 'Finishing Overheads',
        rate: 4.5,
        calculation_basis: 'Per Piece',
        quantity: qty,
        amount: qty * 4.5,
      }
    );
  }

  const poRates = await fetchPurchaseOrderRates().catch(() => ({}));
  const updatedItems = items.map((it) => {
    const poRate = poRates[it.product];
    const unitPrice = poRate > 0 ? poRate : it.unit_price;
    return {
      ...it,
      unit_price: unitPrice,
      actual_amount: it.actual_utilization * unitPrice,
    };
  });

  return {
    top: {
      belt_type: product?.belt_type || values.belt_type || 'Standard Belt',
      length,
      width,
      holes,
      ratio: values.ratio || product?.ratio || 1,
      total_processes: totalProcesses,
      roll_division_factor: factor,
      roll_required: Math.round(rollMeters * 100) / 100,
      roll_available: values.roll_available || rollMeters,
      roll_consumed: values.roll_consumed || rollMeters,
      remaining_roll: Math.max(0, (values.roll_available || rollMeters) - (values.roll_consumed || rollMeters)),
    },
    tables: {
      items: updatedItems,
      ...(totalProcesses === 4 ? { charges } : {}),
    },
  };
}

export const BELT_STAGE_LABELS = {
  1: 'Stage 1 (Roll Creation)',
  2: 'Stage 2 (Belt Sizing)',
  3: 'Stage 3 (Belt Finishing)',
  4: 'Stage 4 (Charges)',
};

/**
 * Stage calculation for Belt Batch matching PU Batch stageCalc format
 * @param {1|2|3|4} stage
 * @param {object} v
 */
export function beltStageCalc(stage, v) {
  const qty = n(v.quantity || v.planned_quantity);
  const length = n(v.length);
  const width = n(v.width);
  const factor = getBeltDivisionFactor(width, v.roll_division_factor);
  const rollRequired = factor > 0 ? (length / 1000 * qty) / factor : 0;
  const rollConsumed = v.roll_consumed !== undefined && v.roll_consumed !== '' ? n(v.roll_consumed) : rollRequired;
  const wastageQty = Math.max(0, rollConsumed - rollRequired);

  let carried = 0;
  let added = 0;
  let extraCostTotal = 0;

  const holes = n(v.holes || v.hole || 0);
  const size = n(v.size);
  const items = (v.items || []).map((r) => {
    let price = n(r.unit_price);
    const ratio = n(r.ratio);
    let perUnit = n(r.per_unit_utilization);

    if (stage === 2 && size > 0 && ratio > 0) {
      // Stage 2 roll sizing: size * quantity produced / ratio (perUnit = size / ratio, total = perUnit * qty)
      perUnit = size / ratio;
    } else if (stage === 3) {
      // Stage 3 roll finished: calculation type * ratio
      if (r.calculation_type === 'Hole') {
        perUnit = holes * ratio;
      } else if (r.calculation_type === 'Quantity') {
        perUnit = ratio;
      }
    } else if (r.calculation_type === 'Hole' && holes > 0 && ratio > 0) {
      perUnit = holes * ratio;
    } else if (r.calculation_type === 'Quantity' && ratio > 0) {
      perUnit = ratio;
    }

    // Auto-fill carried-in row unit_price from previous stage cost (only if currently 0)
    if (r.is_carried_in && stage > 1 && price === 0) {
      const prevStage = stage - 1;
      const actualPrevCost = _latestStageUnitCosts[prevStage];
      if (actualPrevCost > 0) {
        price = actualPrevCost;
      }
    }

    // Auto-populate unit price from PO cache if price is currently 0
    if (!r.is_carried_in && price === 0 && _poRatesCache && _poRatesCache[r.product] > 0) {
      price = _poRatesCache[r.product];
    }

    const isFabric = isFabricItem(r.product, r.uom);
    // In Stage 1: fabric calculates in meters (perUnit * qty). Other products (chemicals, powder, sheets) calculate in kg from grams ((perUnit * qty) / 1000).
    const total = (stage === 1 && !isFabric) ? (perUnit * qty) / 1000 : perUnit * qty;
    const oldAutoQty = perUnit * qty;
    const actualQty =
      r.actual_utilization !== undefined &&
      r.actual_utilization !== '' &&
      (stage !== 1 || isFabric || Math.abs(n(r.actual_utilization) - oldAutoQty) > 0.0001)
        ? n(r.actual_utilization)
        : total;
    const actualAmount = actualQty * price;
    const rowExtra = n(r.extra_cost) * qty;

    const out = {
      ...r,
      unit_price: price,
      per_unit_utilization: perUnit,
      total_utilization: total,
      actual_utilization: actualQty,
      amount: total * price,
      per_unit_amount: perUnit * price,
      actual_amount: actualAmount,
    };

    if (r.is_carried_in) {
      carried += actualAmount;
    } else {
      added += actualAmount;
    }

    extraCostTotal += rowExtra;
    return out;
  });

  added += extraCostTotal;

  const rows = { items };
  let chargeTotal = 0;

  if (stage === 4) {
    rows.charges = (v.charges || []).map((c) => {
      const rate = n(c.per_unit_price || c.rate);
      let basisQty = qty;
      if (c.calculation_basis === 'Per Meter') {
        basisQty = rollConsumed || 1;
      } else if (c.calculation_basis === 'Fixed') {
        basisQty = 1;
      }
      const amount = rate * basisQty;
      chargeTotal += amount;
      return {
        ...c,
        quantity: basisQty,
        amount,
      };
    });
    added += chargeTotal;
  }

  const rejectionPercent = n(v.rejection_percent);
  const rejectionAmount = (carried + added) * (rejectionPercent / 100);
  const batchTotal = carried + added + rejectionAmount;
  const unitCost = qty > 0 ? batchTotal / qty : 0;
  if (unitCost > 0) {
    _latestStageUnitCosts[stage] = unitCost;
  }

  const top = {
    carried_cost: carried,
    added_cost: added,
    rejection_amount: rejectionAmount,
    batch_total: batchTotal,
    unit_cost: unitCost,
    ...(stage === 1 ? {
      roll_division_factor: factor,
      roll_required: Math.round(rollRequired * 100) / 100,
      roll_consumed: Math.round(rollConsumed * 100) / 100,
      wastage_qty: Math.round(wastageQty * 100) / 100,
    } : {}),
    ...(stage === 4 ? {
      charge_total: chargeTotal,
    } : {}),
  };

  return { top, rows };
}

/**
 * Stage rows loader for Belt Batch matching PU Batch stageRows format
 * @param {1|2|3|4} stage
 */
export const beltStageRows = (stage) => async (values) => {
  const productName = values.product;
  let bom = null;
  let product = null;

  if (productName) {
    try {
      product = await db.table('Product').get(productName);
    } catch (_) {}
    if (!product) {
      try { product = await getDoc('Product', productName); } catch (_) {}
    }
    try {
      bom = await db.table('BOM').get(productName);
    } catch (_) {}
    if (!bom) {
      try { bom = await getDoc('BOM', productName); } catch (_) {}
    }
  }

  const qty = n(values.quantity || values.planned_quantity || 100);
  const holes = n(values.holes || product?.hole || 0);

  if (bom) {
    let stageItems = [];
    let stageCharges = [];

    if (stage === 1) {
      const rows = bom.stage1_items?.length ? bom.stage1_items : bom.belt_p1_items || [];
      stageItems = await Promise.all(
        rows.map(async (r) => {
          let p = null;
          if (r.product) {
            try { p = await db.table('Product').get(r.product); } catch (_) {}
            if (!p) {
              try { p = await getDoc('Product', r.product); } catch (_) {}
            }
          }
          const uom = r.uom || p?.uom || '';
          const isFabric = isFabricItem(r.product, uom);
          const perUnit = n(r.per_unit_utilization);
          const total = isFabric ? perUnit * qty : (perUnit * qty) / 1000;
          const poRate = await getProductPurchaseRate(r.product);
          const unitPrice = poRate || n(r.unit_price) || n(p?.last_purchase_rate) || n(p?.standard_rate) || n(p?.valuation_rate) || 0;
          return {
            process: r.process || 'Process 1: Roll Creation',
            product: r.product,
            uom,
            per_unit_utilization: perUnit,
            total_utilization: total,
            actual_utilization: total,
            unit_price: unitPrice,
            actual_amount: total * unitPrice,
            is_carried_in: false,
          };
        })
      );
    } else if (stage === 2) {
      const rows = bom.stage2_items?.length ? bom.stage2_items : bom.belt_p2_items || [];
      const sizeVal = n(values.size || product?.size || 0);
      stageItems = await Promise.all(
        rows.map(async (r) => {
          let p = null;
          if (r.product) {
            try { p = await db.table('Product').get(r.product); } catch (_) {}
            if (!p) {
              try { p = await getDoc('Product', r.product); } catch (_) {}
            }
          }
          const ratio = n(r.ratio) || 1;
          const perUnit = sizeVal > 0 && ratio > 0 ? sizeVal / ratio : ratio;
          const total = perUnit * qty;
          const poRate = await getProductPurchaseRate(r.product);
          const unitPrice = poRate || n(r.unit_price) || n(p?.last_purchase_rate) || n(p?.standard_rate) || n(p?.valuation_rate) || 0;
          return {
            process: r.process || 'Process 2: Roll Sizing',
            product: r.product,
            ratio,
            per_unit_utilization: perUnit,
            total_utilization: total,
            actual_utilization: total,
            unit_price: unitPrice,
            actual_amount: total * unitPrice,
            is_carried_in: false,
          };
        })
      );
    } else if (stage === 3) {
      const rows = bom.stage3_items?.length ? bom.stage3_items : bom.belt_p3_items || [];
      stageItems = await Promise.all(
        rows.map(async (r) => {
          let p = null;
          if (r.product) {
            try { p = await db.table('Product').get(r.product); } catch (_) {}
            if (!p) {
              try { p = await getDoc('Product', r.product); } catch (_) {}
            }
          }
          const ratio = n(r.ratio) || 1;
          const calcType = r.calculation_type || 'Quantity';
          const perUnit = calcType === 'Hole' ? holes * ratio : ratio;
          const total = perUnit * qty;
          const poRate = await getProductPurchaseRate(r.product);
          const unitPrice = poRate || n(r.unit_price) || n(p?.last_purchase_rate) || n(p?.standard_rate) || n(p?.valuation_rate) || 0;
          return {
            process: r.process || 'Process 3: Roll Finished',
            product: r.product,
            calculation_type: calcType,
            ratio,
            per_unit_utilization: perUnit,
            total_utilization: total,
            actual_utilization: total,
            unit_price: unitPrice,
            actual_amount: total * unitPrice,
            is_carried_in: false,
          };
        })
      );
    } else if (stage === 4) {
      const rows = bom.stage3_charges?.length ? bom.stage3_charges : bom.belt_p4_charges || [];
      stageCharges = rows.map((c) => {
        const rate = n(c.per_unit_price);
        return {
          process: 'Process 4: Charges',
          charge: c.charge,
          per_unit_price: rate,
          rate,
          calculation_basis: 'Per Piece',
          quantity: qty,
          amount: qty * rate,
        };
      });
    }

    if (stage > 1) {
      const prevStage = stage - 1;
      const prevLabel = BELT_STAGE_LABELS[prevStage] || `Process ${prevStage}`;
      const prevRate = await getPreviousStageUnitCost(prevStage, productName);

      stageItems = [
        {
          process: prevLabel,
          product: `${productName} (After ${prevLabel})`,
          is_carried_in: true,
          per_unit_utilization: 1,
          total_utilization: qty,
          actual_utilization: qty,
          unit_price: prevRate,
          actual_amount: qty * prevRate,
          extra_cost: 0,
        },
        ...stageItems,
      ];
    }

    return {
      top: {
        holes: (values.holes !== undefined && values.holes !== '' && values.holes !== null) ? values.holes : (product?.hole ?? ''),
        length: (values.length !== undefined && values.length !== '' && values.length !== null) ? values.length : (product?.belt_length ?? ''),
        width: (values.width !== undefined && values.width !== '' && values.width !== null) ? values.width : (product?.belt_width ?? ''),
        size: (values.size !== undefined && values.size !== '' && values.size !== null) ? values.size : (product?.size ?? ''),
        belt_type: product?.belt_type || values.belt_type || 'Grommed',
      },
      tables: {
        items: stageItems,
        charges: stageCharges,
      },
    };
  }

  // Fallback to existing logic if no BOM
  const all = await loadBeltBatchRows(values);

  let stageItems = (all.tables?.items || []).filter((item) => {
    if (stage === 1) return item.process?.includes('1') || item.process?.includes('Roll');
    if (stage === 2) return item.process?.includes('2') || item.process?.includes('Sizing');
    if (stage === 3) return item.process?.includes('3') || item.process?.includes('Finishing');
    if (stage === 4) return item.process?.includes('4') || item.process?.includes('Charges');
    return true;
  });

  if (stage > 1) {
    const prevStage = stage - 1;
    const prevLabel = BELT_STAGE_LABELS[prevStage] || `Process ${prevStage}`;
    const prevRate = stage === 2 ? 65 : stage === 3 ? 110 : 135;
    stageItems = [
      {
        process: prevLabel,
        product: `${values.product || 'Belt'} (After ${prevLabel})`,
        is_carried_in: true,
        per_unit_utilization: 1,
        total_utilization: qty,
        actual_utilization: qty,
        unit_price: prevRate,
        actual_amount: qty * prevRate,
        extra_cost: 0,
      },
      ...stageItems,
    ];
  }

  return {
    top: {
      ...all.top,
      holes: (values.holes !== undefined && values.holes !== '' && values.holes !== null) ? values.holes : (product?.hole ?? (all.top?.holes ?? '')),
      length: (values.length !== undefined && values.length !== '' && values.length !== null) ? values.length : (product?.belt_length ?? (all.top?.length ?? '')),
      width: (values.width !== undefined && values.width !== '' && values.width !== null) ? values.width : (product?.belt_width ?? (all.top?.width ?? '')),
      size: (values.size !== undefined && values.size !== '' && values.size !== null) ? values.size : (product?.size ?? (all.top?.size ?? '')),
    },
    tables: {
      items: stageItems,
      ...(stage === 4 ? { charges: all.tables?.charges || [] } : {}),
    },
  };
};
