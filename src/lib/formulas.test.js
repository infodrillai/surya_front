import { describe, expect, it } from 'vitest';
import { computeQuotationPR } from './formulas';

describe('existing order pricing', () => {
  it('applies markup once to the entered rate before multiplying quantity', () => {
    expect(computeQuotationPR({ quantity: 3, rate: 100, pr: 20 })).toEqual({ pr: 20, final_rate: 120, amount: 360 });
  });
});
