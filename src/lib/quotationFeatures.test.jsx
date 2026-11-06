import { describe, expect, it } from 'vitest';
import { enhanceQuotation, isQuotationExpired, getEffectiveQuotationStatus } from './quotationFeatures';
import { buildDefaults, buildSchema } from './schema';

const config = { fields: [], tables: [{ fields: ['product', 'production_cost', 'uom', 'rate', 'pr', 'quantity'].map(name => ({ name })) }], rowActions: [{ key: 'download_pdf' }], columns: [] };
enhanceQuotation(config);
const compute = (values) => config.compute({ currency: 'INR', exchange_rate: 1, gst_percent: 18, discount_percent: 5, ...values }, { companyState: 'Gujarat' });

describe('quotation preview', () => {
  it('applies line discount before overall discount and tax', () => {
    const result = compute({ items: [{ quantity: 2, rate: 150, pricing_mode: 'Rate', production_cost: 100, item_discount_percent: 10 }] });
    expect(result.top.subtotal).toBe(270);
    expect(result.top.discount_amount).toBe(13.5);
    expect(result.top.grand_total).toBeCloseTo(256.5);
  });
  it('converts the cost base for currency and quoted units', () => {
    const result = compute({ currency: 'USD', exchange_rate: 50, items: [{ quantity: 2, production_cost: 100, reference_exchange_rate: 1, conversion_factor: 2, pricing_mode: 'Percentage', pr: 25, item_discount_percent: 10 }] });
    expect(result.rows.items[0].rate).toBe(5);
    expect(result.top.grand_total).toBeCloseTo(8.55);
  });
  it('keeps stored foreign-currency costs unchanged when reopened or recomputed', () => {
    const values = { currency: 'USD', exchange_rate: 50, items: [{ quantity: 1, production_cost: 2, last_selling_price: 3, pricing_mode: 'Percentage', pr: 25 }] };
    const first = compute(values);
    const again = compute({ ...values, items: first.rows.items });
    expect(first.rows.items[0].rate).toBe(2.5);
    expect(again).toEqual(first);
  });
  it('calculates rate and amount including GST: Rate = Cost * (1 + PR%) * (1 + GST%)', () => {
    const result = compute({ items: [{ quantity: 2, production_cost: 100, pr: 20, gst_percent: 18, pricing_mode: 'Percentage', item_discount_percent: 0 }] });
    // Cost: 100, PR: 20% -> 120. With 18% GST -> 120 * 1.18 = 141.6
    expect(result.rows.items[0].rate).toBeCloseTo(141.6);
    // Qty: 2, Rate: 141.6 -> Amount = 283.2
    expect(result.rows.items[0].amount).toBeCloseTo(283.2);
  });
  it('preserves a manual selling rate when the base cost is zero', () => {
    const result = compute({ items: [{ quantity: 1, production_cost: 0, rate: 17, pricing_mode: 'Rate' }] });
    expect(result.rows.items[0].rate).toBe(17);
  });
  it('converts manual rates and charges without repeated conversion', () => {
    const initial = compute({ packing_charges: 100, items: [{ quantity: 2, rate: 150, production_cost: 100, pricing_mode: 'Rate' }] });
    const values = { ...initial.top, currency: 'USD', exchange_rate: 50, gst_percent: 18, discount_percent: 5, items: initial.rows.items };
    const converted = compute(values);
    expect(converted.rows.items[0].rate).toBe(3);
    expect(converted.top.packing_charges).toBe(2);
    expect(converted.top.grand_total * 50).toBeCloseTo(initial.top.grand_total);
    expect(compute({ ...values, ...converted.top, items: converted.rows.items })).toEqual(converted);
  });
  it('retains an entered markup while product cost is loading', () => {
    const result = compute({ items: [{ quantity: 1, production_cost: 0, pricing_mode: 'Percentage', pr: 25 }] });
    expect(result.rows.items[0].pr).toBe(25);
  });
  it('requires an explicitly entered foreign exchange rate', () => {
    const values = buildDefaults(config, { currency: 'USD', exchange_rate: '', items: [] });
    expect(buildSchema(config).safeParse(values).success).toBe(false);
  });
  it('clears the exchange rate when selecting a foreign currency', () => {
    const values = { currency: 'USD', exchange_rate: 1 };
    config.fields.find(f => f.name === 'currency').onChange(values);
    expect(values.exchange_rate).toBe('');
  });
  it('computes valid_until based on validity_days', () => {
    const result = compute({ quotation_date: '2025-01-01', validity_days: 15, items: [] });
    expect(result.top.valid_until).toBe('2025-01-16');
  });
  it('marks an expired quotation as Disapproved and locked', () => {
    const expiredDoc = { quotation_date: '2020-01-01', validity_days: 15, status: 'Draft' };
    expect(isQuotationExpired(expiredDoc)).toBe(true);
    expect(getEffectiveQuotationStatus(expiredDoc)).toBe('Disapproved');
    expect(config.isLocked(expiredDoc)).toBe(true);
  });
  it('maintains Rejected status and locks the quotation', () => {
    const rejectedDoc = { quotation_date: '2026-11-01', validity_days: 30, status: 'Rejected' };
    expect(getEffectiveQuotationStatus(rejectedDoc)).toBe('Rejected');
    expect(config.isLocked(rejectedDoc)).toBe(true);
  });
});