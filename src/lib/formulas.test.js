import { describe, expect, it } from 'vitest';
import { computeQuotationPR } from './formulas';

describe('existing order pricing', () => {
  it('applies markup once to the entered rate before multiplying quantity', () => {
    expect(computeQuotationPR({ quantity: 3, rate: 100, pr: 20 })).toEqual({ pr: 20, final_rate: 120, amount: 360 });
  });
});

import {
  calculateRequiredRoll,
  calculateProductionQtyFromRoll,
  calculateBeltComponents,
  getBeltDivisionFactor,
  beltBatchCalc
} from './formulas';
import { beltStageCalc } from './beltBatchLogic';

describe('Belt Manufacturing Formulas', () => {
  it('determines roll division factor based on width', () => {
    expect(getBeltDivisionFactor(98)).toBe(3);
    expect(getBeltDivisionFactor(122)).toBe(2);
    expect(getBeltDivisionFactor(112)).toBe(2);
    expect(getBeltDivisionFactor(98, 2)).toBe(2); // explicit override
  });

  describe('Formula 1: Required Roll (Specification Table Examples)', () => {
    it('Example 1: 230 mm length, 98 mm width, 100 PCS, Factor 3 -> 7.67 m', () => {
      const res = calculateRequiredRoll({ length: 230, width: 98, quantity: 100 });
      expect(res.divisionFactor).toBe(3);
      expect(res.rollMeters).toBeCloseTo(7.6667, 2);
    });

    it('Example 2: 240 mm length, 98 mm width, 200 PCS, Factor 3 -> 16 m', () => {
      const res = calculateRequiredRoll({ length: 240, width: 98, quantity: 200 });
      expect(res.divisionFactor).toBe(3);
      expect(res.rollMeters).toBeCloseTo(16.0, 2);
    });

    it('Example 3: 230 mm length, 122 mm width, 100 PCS, Factor 2 -> 11.5 m', () => {
      const res = calculateRequiredRoll({ length: 230, width: 122, quantity: 100 });
      expect(res.divisionFactor).toBe(2);
      expect(res.rollMeters).toBeCloseTo(11.5, 2);
    });

    it('Example 4: 236 mm length, 112 mm width, 200 PCS, Factor 2 -> 23.6 m', () => {
      const res = calculateRequiredRoll({ length: 236, width: 112, quantity: 200 });
      expect(res.divisionFactor).toBe(2);
      expect(res.rollMeters).toBeCloseTo(23.6, 2);
    });

    it('Example 5: 472 mm length, 122 mm width, 200 PCS, Factor 2 -> 47.2 m', () => {
      const res = calculateRequiredRoll({ length: 472, width: 122, quantity: 200 });
      expect(res.divisionFactor).toBe(2);
      expect(res.rollMeters).toBeCloseTo(47.2, 2);
    });
  });

  describe('Formula 2: Production Quantity from Roll', () => {
    it('calculates whole PCS quantity and remaining roll', () => {
      // 16 m roll, 240 mm length, factor 3 -> 200 PCS, 0 remaining
      const res1 = calculateProductionQtyFromRoll({ rollMeters: 16, length: 240, width: 98 });
      expect(res1.pcs).toBe(200);
      expect(res1.remainingRoll).toBeCloseTo(0, 2);

      // 10 m roll, 230 mm length, factor 3 -> floor(10 * 3 * 1000 / 230) = 130 PCS
      const res2 = calculateProductionQtyFromRoll({ rollMeters: 10, length: 230, width: 98 });
      expect(res2.pcs).toBe(130);
      expect(res2.consumedRoll).toBeCloseTo((230 / 1000 * 130) / 3, 2);
      expect(res2.remainingRoll).toBeCloseTo(10 - res2.consumedRoll, 2);
    });
  });

  describe('Formula 3: Component Calculations', () => {
    it('calculates eyelets, rivets, and aluminium patti per specifications', () => {
      const comp = calculateBeltComponents({ quantity: 50, holes: 6 });
      expect(comp.eyelets).toBe(6 * 4 * 50); // 1200
      expect(comp.rivets).toBe(6 * 4 * 50);  // 1200
      expect(comp.aluminiumPatti).toBe(50 * 2); // 100
      expect(comp.aluminiumPattiRivets).toBe(50 * 4); // 200
    });
  });

  describe('Belt Batch Live Preview Calculation', () => {
    it('calculates roll, components, charges, and unit cost', () => {
      const preview = beltBatchCalc(2, {
        planned_quantity: 100,
        length: 230,
        width: 98,
        hole: 4,
        rejection_percent: 5,
        items: [
          { component_type: 'Eyelet', unit_price: 0.5 },
          { component_type: 'Patti', unit_price: 10 },
        ],
        charges: [
          { rate: 5, calculation_basis: 'Per Piece' },
        ],
        total_processes: 4,
      });

      expect(preview.top.roll_division_factor).toBe(3);
      expect(preview.top.roll_required).toBe(7.67);
      expect(preview.top.accepted_quantity).toBe(95);
      expect(preview.top.rejected_quantity).toBe(5);
      expect(preview.top.batch_total).toBeGreaterThan(0);
      expect(preview.top.unit_cost).toBeGreaterThan(0);
    });
  });

  describe('Belt Stage Calculations (PU Batch design format)', () => {
    it('calculates Process 1 (Roll Creation) with required roll, wastage and cost', () => {
      const p1 = beltStageCalc(1, {
        quantity: 100,
        length: 230,
        width: 98,
        roll_consumed: 8,
        items: [
          { per_unit_utilization: 0.0767, actual_utilization: 7.67, unit_price: 150 },
        ],
        rejection_percent: 2,
      });

      expect(p1.top.roll_division_factor).toBe(3);
      expect(p1.top.roll_required).toBe(7.67);
      expect(p1.top.roll_consumed).toBe(8);
      expect(p1.top.wastage_qty).toBe(0.33);
      expect(p1.top.carried_cost).toBe(0);
      expect(p1.top.added_cost).toBeCloseTo(7.67 * 150, 1);
      expect(p1.top.batch_total).toBeGreaterThan(p1.top.added_cost);
      expect(p1.top.unit_cost).toBeCloseTo(p1.top.batch_total / 100, 2);
    });

    it('calculates Stage 1 with Fabric in meters and other materials in kg from gm', () => {
      const p1 = beltStageCalc(1, {
        quantity: 100,
        items: [
          { product: 'RAW-FABRIC Fabric Roll', uom: 'Meter', per_unit_utilization: 2 },
          { product: 'IPA-001 IPA', uom: 'KG', per_unit_utilization: 20.853 },
          { product: 'RAW-RESORCINOL', uom: 'KG', per_unit_utilization: 20.853 },
          { product: 'RAW-NYLON POWDER', uom: 'KG', per_unit_utilization: 1.146 },
          { product: 'RAW-NYLON SHEET (coating)', uom: 'KG', per_unit_utilization: 0.6411 },
          { product: 'RAW-NYLON SHEET (sizing)', uom: 'KG', per_unit_utilization: 153.8 },
          { product: 'RAW-BONDING', uom: 'KG', per_unit_utilization: 43.5 },
          { product: 'RAW-HUB 1046M', uom: 'KG', per_unit_utilization: 30.77 },
          { product: 'RAW-CL501', uom: 'KG', per_unit_utilization: 2.31 },
          { product: 'RAW-TOLUENE', uom: 'KG', per_unit_utilization: 46.15 },
        ],
      });

      // Fabric: 2 * 100 = 200 meters
      expect(p1.rows.items[0].total_utilization).toBe(200);
      expect(p1.rows.items[0].actual_utilization).toBe(200);

      // Other products: (per_unit * 100) / 1000 = kg
      expect(p1.rows.items[1].total_utilization).toBeCloseTo(2.0853, 4);
      expect(p1.rows.items[1].actual_utilization).toBeCloseTo(2.0853, 4);

      expect(p1.rows.items[2].total_utilization).toBeCloseTo(2.0853, 4);
      expect(p1.rows.items[2].actual_utilization).toBeCloseTo(2.0853, 4);

      expect(p1.rows.items[3].total_utilization).toBeCloseTo(0.1146, 4);
      expect(p1.rows.items[3].actual_utilization).toBeCloseTo(0.1146, 4);

      expect(p1.rows.items[4].total_utilization).toBeCloseTo(0.06411, 5);
      expect(p1.rows.items[4].actual_utilization).toBeCloseTo(0.06411, 5);

      expect(p1.rows.items[5].total_utilization).toBeCloseTo(15.38, 2);
      expect(p1.rows.items[5].actual_utilization).toBeCloseTo(15.38, 2);

      expect(p1.rows.items[6].total_utilization).toBeCloseTo(4.35, 2);
      expect(p1.rows.items[6].actual_utilization).toBeCloseTo(4.35, 2);

      expect(p1.rows.items[7].total_utilization).toBeCloseTo(3.077, 3);
      expect(p1.rows.items[7].actual_utilization).toBeCloseTo(3.077, 3);

      expect(p1.rows.items[8].total_utilization).toBeCloseTo(0.231, 3);
      expect(p1.rows.items[8].actual_utilization).toBeCloseTo(0.231, 3);

      expect(p1.rows.items[9].total_utilization).toBeCloseTo(4.615, 3);
      expect(p1.rows.items[9].actual_utilization).toBeCloseTo(4.615, 3);
    });

    it('calculates Process 2 (Belt Sizing) with carried-in roll cost and added components', () => {
      const p2 = beltStageCalc(2, {
        quantity: 100,
        length: 230,
        width: 98,
        items: [
          { is_carried_in: true, actual_utilization: 100, unit_price: 65 },
          { is_carried_in: false, actual_utilization: 1600, unit_price: 0.25 }, // Eyelets
          { is_carried_in: false, actual_utilization: 200, unit_price: 8.5 }, // Patti
        ],
        rejection_percent: 0,
      });

      expect(p2.top.carried_cost).toBe(6500);
      expect(p2.top.added_cost).toBe(1600 * 0.25 + 200 * 8.5); // 400 + 1700 = 2100
      expect(p2.top.batch_total).toBe(8600);
      expect(p2.top.unit_cost).toBe(86);
    });

    it('calculates Process 4 (Charges) with charges and grand unit cost', () => {
      const p4 = beltStageCalc(4, {
        quantity: 100,
        length: 230,
        width: 98,
        roll_consumed: 7.67,
        items: [
          { is_carried_in: true, actual_utilization: 100, unit_price: 120 },
        ],
        charges: [
          { charge: 'Labour', rate: 10, calculation_basis: 'Per Piece' },
          { charge: 'Bonding', rate: 5, calculation_basis: 'Per Meter' },
        ],
        rejection_percent: 5,
      });

      expect(p4.top.carried_cost).toBe(12000);
      expect(p4.top.charge_total).toBeCloseTo(100 * 10 + 7.67 * 5, 2); // 1000 + 38.35 = 1038.35
      expect(p4.top.batch_total).toBeCloseTo((12000 + 1038.35) * 1.05, 1);
      expect(p4.top.unit_cost).toBeCloseTo(p4.top.batch_total / 100, 2);
    });

    it('calculates Process 3 items based on Hole (e.g. 7 holes * ratio 4 -> 28 per unit) and Quantity', () => {
      const p3 = beltStageCalc(3, {
        quantity: 10,
        holes: 7,
        items: [
          { is_carried_in: true, per_unit_utilization: 1, unit_price: 100 },
          { is_carried_in: false, calculation_type: 'Hole', ratio: 4, unit_price: 2 },
          { is_carried_in: false, calculation_type: 'Quantity', ratio: 5, unit_price: 3 },
        ],
      });

      // Item 1 (carried): 10 * 100 = 1000
      // Item 2 (Hole): per_unit = 7 * 4 = 28, total_utilization = 28 * 10 = 280, amount = 280 * 2 = 560
      // Item 3 (Quantity): per_unit = 5, total_utilization = 5 * 10 = 50, amount = 50 * 3 = 150
      expect(p3.rows.items[1].per_unit_utilization).toBe(28);
      expect(p3.rows.items[1].total_utilization).toBe(280);
      expect(p3.rows.items[1].actual_amount).toBe(560);

      expect(p3.rows.items[2].per_unit_utilization).toBe(5);
      expect(p3.rows.items[2].total_utilization).toBe(50);
      expect(p3.rows.items[2].actual_amount).toBe(150);

      expect(p3.top.carried_cost).toBe(1000);
      expect(p3.top.added_cost).toBe(710);
      expect(p3.top.batch_total).toBe(1710);
      expect(p3.top.unit_cost).toBe(171);
    });
  });
});
