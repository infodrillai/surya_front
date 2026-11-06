/**
 * Costing formulas. Mirrors backend clssurya/utils/costing.py - the server is authoritative,
 * these only drive live previews. Full precision is kept; round only when displaying.
 *
 * Base = carried + added (+ tooling in Stage 3); Rejection = Base x rejection%; Total = Base + Rejection; Unit = Total / qty
 */

/** @param {*} v @returns {number} */
export const n = (v) => Number(v) || 0;

/** The single money-rounding rule: 2 dp, half up (display only). @param {*} v */
export const money = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;

const r9 = (v) => Math.round(v * 1e9) / 1e9;

/**
 * @param {number} carried @param {number} added @param {number} rejectionPercent @param {number} qty @param {number} [tooling]
 * @returns {{base:number, rejectionAmount:number, batchTotal:number, unitCost:number}}
 */
export function stageTotals(carried, added, rejectionPercent, qty, tooling = 0, rejectionPerPiece = 0) {
  const base = n(carried) + n(added) + n(tooling);
  // a per-piece amount overrides the percentage when entered
  const rejectionAmount = n(rejectionPerPiece) > 0
    ? n(rejectionPerPiece) * n(qty)
    : (base * n(rejectionPercent)) / 100;
  const batchTotal = base + rejectionAmount;

  // Unit cost = cost per GOOD piece (batch total spread only over accepted output)
  // goodQty = qty × (1 − rejection% / 100)  e.g. 200 × (1 − 4.599/100) = 190.802
  const goodQty = n(rejectionPercent) > 0
    ? n(qty) * (1 - n(rejectionPercent) / 100)
    : n(qty);
  const effectiveQty = goodQty > 0 ? goodQty : n(qty);

  return { base, rejectionAmount, batchTotal, unitCost: effectiveQty > 0 ? batchTotal / effectiveQty : 0 };
}

/** Tooling cost = tooling % x (carried cost + the charges marked "in tooling base"). */
export const toolingAmount = (carried, markedCharges, percent) => ((n(carried) + n(markedCharges)) * n(percent)) / 100;

/** Wastage = material used - (output qty x weight per piece). */
export const stage1Wastage = (used, qty, weightPerPiece) => r9(n(used) - n(qty) * n(weightPerPiece));

/**
 * @param {number} amount @param {number} gstPercent @param {string} vendorState @param {string} companyState
 * @returns {{cgst:number, sgst:number, igst:number}}
 */
export function splitGst(amount, gstPercent, vendorState, companyState) {
  const tax = (n(amount) * n(gstPercent)) / 100;
  const same = String(vendorState || '').trim().toLowerCase() === String(companyState || '').trim().toLowerCase();
  return same ? { cgst: tax / 2, sgst: tax / 2, igst: 0 } : { cgst: 0, sgst: 0, igst: tax };
}

/** Landed cost: spread extra charges over rows by value. @param {number[]} amounts @param {number} extra */
export function allocateExtra(amounts, extra) {
  const total = amounts.reduce((a, b) => a + b, 0);
  return amounts.map((a) => (total ? (n(extra) * a) / total : 0));
}

/**
 * Live preview for a Stage 1/2/3 batch form.
 * Row "extra_cost" is entered PER PIECE and multiplied by the quantity (counted once, as an added cost).
 * Stage 3 order: carried + charges, then tooling % of (carried + marked charges), then rejection on the lot.
 * @param {1|2|3} stage @param {object} v form values
 * @returns {{top:object, rows:object}} patch for the form
 */
export function stageCalc(stage, v) {
  const qty = n(v.quantity);

  let carried = 0;
  let added = 0;
  let extraCostTotal = 0;
  let used = 0;

  const items = (v.items || []).map((r) => {
    const price = n(r.unit_price);
    let perUnit = n(r.per_unit_utilization);
    if (stage === 2 && n(v.size) > 0 && n(r.ratio) > 0) {
      perUnit = n(v.size) / n(r.ratio);
    }
    const total = perUnit * qty;
    const actualQty = (r.actual_utilization !== undefined && r.actual_utilization !== '') ? n(r.actual_utilization) : total;
    const actualAmount = actualQty * price;
    const rowExtra = n(r.extra_cost) * qty;

    const out = {
      per_unit_utilization: perUnit,
      total_utilization: total,
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
    used += actualQty;

    return out;
  });

  added += extraCostTotal;

  const rows = { items };

  let marked = 0;
  let tooling = 0;

  if (stage === 3) {
    rows.charges = (v.charges || []).map((c) => {
      const amount = n(c.per_unit_price) * qty;
      added += amount;

      if (Number(c.in_tooling_base)) marked += amount;

      return { amount };
    });

    tooling = toolingAmount(carried, marked, v.tooling_percent);
  }

    // `added` already includes extraCostTotal, so don't add it again
  const addedWithoutExtra = added - extraCostTotal;

  const baseTotals = stageTotals(carried, addedWithoutExtra, v.rejection_percent, qty, tooling, v.rejection_per_piece);
  const currentTotals = stageTotals(carried, added, v.rejection_percent, qty, tooling, v.rejection_per_piece);

  const top = {
    carried_cost: carried,
    added_cost: added,
    extra_cost_total: extraCostTotal,
    rejection_amount: currentTotals.rejectionAmount,
    batch_total: currentTotals.batchTotal,
    unit_cost: currentTotals.unitCost,
    unit_cost_without_extra: baseTotals.unitCost,
  };
  if (stage === 3) {
    top.tooling_base = carried + marked;
    top.tooling_amount = tooling;
  }

  if (stage === 1) {
    top.wastage_qty = stage1Wastage(used, qty, v.weight_per_piece);
  }

  return { top, rows };
}

/** Live preview for Purchase Entry. @param {object} v @param {{masters:object, companyState:string}} ctx */
export function purchaseCalc(v, { masters = {}, companyState } = {}) {
  const cState = companyState || Object.values(masters.Company || {})[0]?.default_state || 'Gujarat';
  const vendorState = masters.Vendor?.[v.vendor]?.state || v.vendor_state || '';
  let taxable = 0;
  let totalOrdered = 0;
  let totalReceived = 0;

  const extraCharges = Math.max(0, n(v.extra_charges));
  const gstPct = Math.max(0, n(v.gst_percent));

  const items = (v.items || []).map((r) => {
    const q = Math.max(0, n(r.quantity));
    const rate = Math.max(0, n(r.rate));
    const rcv = Math.max(0, n(r.received_qty));
    const pend = Math.max(0, q - rcv);
    totalOrdered += q;
    totalReceived += rcv;

    const amount = money(q * rate);
    taxable += amount;

    return {
      quantity: q,
      rate,
      amount,
      uom: r.uom || masters.Product?.[r.product]?.uom || '',
      received_qty: rcv,
      pending_qty: pend,
      gst_percent: gstPct > 0 ? gstPct : n(r.gst_percent),
    };
  });

  const shares = allocateExtra(items.map((i) => i.amount), extraCharges);
  items.forEach((it, i) => {
    const q = it.quantity;
    it.landed_rate = q ? Math.round(((it.amount + shares[i]) / q + Number.EPSILON) * 10000) / 10000 : 0;
    const itemGst = gstPct > 0 ? gstPct : n(v.items?.[i]?.gst_percent);
    const g = splitGst(it.amount, itemGst, vendorState, cState);
    it.cgst = g.cgst;
    it.sgst = g.sgst;
    it.igst = g.igst;
  });

  let tax = 0;
  if (gstPct > 0) {
    const taxableBase = taxable + extraCharges;
    const g = splitGst(taxableBase, gstPct, vendorState, cState);
    tax = money(g.cgst + g.sgst + g.igst);
  } else {
    items.forEach((it) => {
      tax += (it.cgst || 0) + (it.sgst || 0) + (it.igst || 0);
    });
    tax = money(tax);
  }

  const grandTotal = money(taxable + extraCharges + tax);
  const totalPending = Math.max(0, totalOrdered - totalReceived);

  return {
    top: {
      vendor_state: vendorState,
      taxable_amount: money(taxable),
      extra_charges: extraCharges,
      gst_percent: gstPct,
      tax_amount: tax,
      grand_total: grandTotal,
      total_ordered_qty: totalOrdered,
      total_received_qty: totalReceived,
      total_pending_qty: totalPending,
    },
    rows: { items },
  };
}

export function computeQuotationPR(item) {
  const qty = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  const pr = Number(item.pr) || 0;
  const final_rate = rate * (1 + pr / 100);
  const amount = final_rate * qty;
  return { pr, final_rate, amount };
}

export function quotationTaxCalc(v, customerState = '', companyState = 'Gujarat') {
  const items = v.items || [];

  const subtotal = items.reduce(
    (total, item) =>
      total + n(item.quantity) * (n(item.final_rate) || n(item.rate)),
    0
  );

  const discountPercent = Math.min(
    100,
    Math.max(0, n(v.discount_percent))
  );

  const discountAmount = (subtotal * discountPercent) / 100;
  const packingCharges = n(v.packing_charges);
  const transportCharges = n(v.transport_charges);
  const taxableItemAmount = Math.max(0, subtotal - discountAmount);
  const taxableAmount = taxableItemAmount + packingCharges + transportCharges;

  // Simplified GST calculation: single GST amount regardless of state
  const gstPercent = v.gst_percent !== undefined && v.gst_percent !== null && v.gst_percent !== '' ? n(v.gst_percent) : 18;
  const taxAmount = (taxableAmount * gstPercent) / 100;
  const grandTotal = taxableAmount + taxAmount;

  return {
    subtotal,
    discount_amount: discountAmount,
    packing_charges: packingCharges,
    transport_charges: transportCharges,
    taxable_amount: taxableAmount,
    cgst,
    sgst,
    igst,
    tax_amount: taxAmount,
    total_amount: subtotal,
    grand_total: grandTotal,
  };
}

/** Quotation / Sales Order preview. Below cost = rate < Finished unit cost. */
export function salesCalc(v, { masters = {}, finishedCost = {} } = {}) {
  let total = 0;
  let below = 0;

  const items = (v.items || []).map((r) => {
    const cost = n(
      finishedCost?.[r.product]?.unit_price ?? r.production_cost
    );

    // Use entered rate when available; otherwise use production cost.
    const rate = r.rate !== undefined && r.rate !== null && r.rate !== ''
      ? n(r.rate)
      : cost;

    const pr = n(r.pr);
    const final_rate = rate * (1 + pr / 100);
    const amount = n(r.quantity) * final_rate;

    const isBelow = !!r.product && rate < cost ? 1 : 0;

    total += amount;
    below = below || isBelow;

    return {
      ...r,
      rate,
      final_rate,
      amount,
      uom: masters?.Product?.[r.product]?.uom || r.uom || '',
      production_cost: cost,
      below_cost: isBelow,
      pending_qty: n(r.quantity) - n(r.dispatched_qty),
    };
  });

  return {
    top: {
      total_amount: total,
      below_cost: below,
    },
    rows: { items },
  };
}


/**
 * Belt Manufacturing Formulas & Calculations
 */

/**
 * Determine roll division factor (2 or 3) from belt width (mm) or explicit setting.
 * Width 84-105 mm: Division Factor = 3
 * Width 106-150 mm: Division Factor = 2
 * @param {number} width 
 * @param {number} [explicitFactor] 
 * @returns {number}
 */
export function getBeltDivisionFactor(width, explicitFactor) {
  const ef = Number(explicitFactor);
  if (ef === 2 || ef === 3) return ef;
  const w = n(width);
  if (w >= 84 && w <= 105) return 3;
  if (w >= 106 && w <= 150) return 2;
  return w <= 105 ? 3 : 2;
}

/**
 * Formula 1: Required Roll (meters) = (Length in mm / 1000 * Production Quantity) / Division Factor
 * @param {{ length: number, quantity: number, width?: number, divisionFactor?: number }} params 
 * @returns {{ rollMeters: number, divisionFactor: number }}
 */
export function calculateRequiredRoll({ length, quantity, width, divisionFactor }) {
  const factor = getBeltDivisionFactor(width, divisionFactor);
  const l = n(length);
  const qty = n(quantity);
  const rollMeters = factor > 0 ? (l / 1000 * qty) / factor : 0;
  return { rollMeters, divisionFactor: factor };
}

/**
 * Formula 2: Production Quantity from Roll
 * Production Quantity (PCS) = Available Roll (meters) * Division Factor * 1000 / Product Length (mm)
 * @param {{ rollMeters: number, length: number, width?: number, divisionFactor?: number }} params 
 * @returns {{ pcs: number, consumedRoll: number, remainingRoll: number, divisionFactor: number }}
 */
export function calculateProductionQtyFromRoll({ rollMeters, length, width, divisionFactor }) {
  const factor = getBeltDivisionFactor(width, divisionFactor);
  const roll = n(rollMeters);
  const l = n(length);
  if (!l || !factor) return { pcs: 0, consumedRoll: 0, remainingRoll: roll, divisionFactor: factor };
  const pcs = Math.floor((roll * factor * 1000) / l);
  const consumedRoll = (l / 1000 * pcs) / factor;
  const remainingRoll = Math.max(0, roll - consumedRoll);
  return { pcs, consumedRoll, remainingRoll, divisionFactor: factor };
}

/**
 * Formula 3: Configurable Belt Components
 * @param {{ quantity: number, holes?: number }} params 
 */
export function calculateBeltComponents({ quantity, holes }) {
  const qty = n(quantity);
  const h = n(holes);
  return {
    eyelets: h * 4 * qty,
    rivets: h * 4 * qty,
    aluminiumPatti: qty * 2,
    aluminiumPattiRivets: qty * 4,
  };
}

/**
 * Live preview calculation for Belt Batch form across processes 1 to 4.
 * Process 1: Roll Creation
 * Process 2: Belt Sizing
 * Process 3: Belt Finishing (if total_processes >= 3)
 * Process 4: Charges (if total_processes = 4)
 * @param {1|2|3|4} processStep 
 * @param {object} v form values 
 */
export function beltBatchCalc(processStep, v) {
  const qty = n(v.quantity || v.planned_quantity);
  const length = n(v.length || v.belt_length);
  const width = n(v.width || v.belt_width);
  const factor = getBeltDivisionFactor(width, v.roll_division_factor);
  const holes = n(v.holes || v.hole);

  let carried = n(v.carried_cost);
  let added = 0;

  // Process 1 roll calculation
  const rollCalc = calculateRequiredRoll({ length, quantity: qty, width, divisionFactor: factor });
  const rollRequired = rollCalc.rollMeters;
  const rollConsumed = v.roll_consumed !== undefined && v.roll_consumed !== '' ? n(v.roll_consumed) : rollRequired;
  const rollAvailable = n(v.roll_available || v.available_roll);
  const remainingRoll = Math.max(0, (rollAvailable > 0 ? rollAvailable : rollRequired) - rollConsumed);

  // Material rows calculation
  const items = (v.items || []).map((r) => {
    const price = n(r.unit_price);
    let perUnit = n(r.per_unit_utilization);

    // If formula based calculation exists
    if (r.formula === 'eyelets' || r.component_type === 'Eyelet') {
      perUnit = holes * 4;
    } else if (r.formula === 'rivets' || r.component_type === 'Rivet') {
      perUnit = holes * 4;
    } else if (r.formula === 'aluminium_patti' || r.component_type === 'Patti') {
      perUnit = 2;
    } else if (r.formula === 'patti_rivets' || r.component_type === 'Patti Rivet') {
      perUnit = 4;
    } else if (r.formula === 'roll') {
      perUnit = factor > 0 ? (length / 1000) / factor : 0;
    }

    const estimatedTotal = perUnit * qty;
    const actualQty = (r.actual_utilization !== undefined && r.actual_utilization !== '') ? n(r.actual_utilization) : estimatedTotal;
    const amount = actualQty * price;

    if (r.is_carried_in) {
      carried += amount;
    } else {
      added += amount;
    }

    return {
      ...r,
      per_unit_utilization: perUnit,
      total_utilization: estimatedTotal,
      amount,
      actual_amount: amount,
    };
  });

  const rows = { items };

  // Process 4 Charges calculation
  let chargeTotal = 0;
  if (processStep === 4 || v.total_processes === 4) {
    rows.charges = (v.charges || []).map((c) => {
      const rate = n(c.rate || c.per_unit_price);
      let basisQty = qty;
      if (c.calculation_basis === 'Per Meter') {
        basisQty = rollConsumed;
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
  const goodQty = rejectionPercent > 0 ? qty * (1 - rejectionPercent / 100) : qty;
  const effectiveQty = goodQty > 0 ? goodQty : qty;
  const unitCost = effectiveQty > 0 ? batchTotal / effectiveQty : 0;

  const top = {
    roll_division_factor: factor,
    roll_required: Math.round(rollRequired * 100) / 100,
    roll_consumed: Math.round(rollConsumed * 100) / 100,
    remaining_roll: Math.round(remainingRoll * 100) / 100,
    carried_cost: carried,
    added_cost: added,
    charge_total: chargeTotal,
    rejection_amount: rejectionAmount,
    batch_total: batchTotal,
    unit_cost: unitCost,
    cost_per_piece: unitCost,
    accepted_quantity: Math.round(goodQty),
    rejected_quantity: Math.round(qty - goodQty),
  };

  return { top, rows };
}
