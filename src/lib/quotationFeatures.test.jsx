import { describe, expect, it } from 'vitest';
import { enhanceQuotation } from './quotationFeatures';
import { buildDefaults, buildSchema } from './schema';

const config = { fields: [], tables: [{ fields: ['product', 'production_cost', 'uom', 'rate', 'pr', 'quantity'].map(name => ({ name })) }], rowActions: [{ key: 'download_pdf' }], columns: [] };
enhanceQuotation(config);
const compute = (values) => config.compute({ currency: 'INR', exchange_rate: 1, gst_percent: 18, discount_percent: 5, ...values }, { companyState: 'Gujarat' });

describe('quotation preview', () => {
  it('applies line discount before overall discount and tax', () => {
    const result = compute({ items: [{ quantity: 2, rate: 150, pricing_mode: 'Rate', production_cost: 100, item_discount_percent: 10 }] });
    expect(result.top.subtotal).toBe(270);
    expect(result.top.discount_amount).toBe(13.5);
    expect(result.top.grand_total).toBeCloseTo(302.67);
    expect(result.rows.items[0].pr).toBe(50);
  });
  it('converts the cost base for currency and quoted units', () => {
    const result = compute({ currency: 'USD', exchange_rate: 50, items: [{ quantity: 2, production_cost: 100, reference_exchange_rate: 1, conversion_factor: 2, pricing_mode: 'Percentage', pr: 25, item_discount_percent: 10 }] });
    expect(result.rows.items[0].rate).toBe(5);
    expect(result.top.grand_total).toBeCloseTo(10.089);
  });
  it('keeps stored foreign-currency costs unchanged when reopened or recomputed', () => {
    const values = { currency: 'USD', exchange_rate: 50, items: [{ quantity: 1, production_cost: 2, last_selling_price: 3, pricing_mode: 'Percentage', pr: 25 }] };
    const first = compute(values);
    const again = compute({ ...values, items: first.rows.items });
    expect(first.rows.items[0].rate).toBe(2.5);
    expect(again).toEqual(first);
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
});
