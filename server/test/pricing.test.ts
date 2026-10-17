/**
 * Business-rule unit tests for the pricing / tier / commission engine.
 *
 * These are the rules the specification pins down numerically, so they are
 * asserted directly against `tierCalculator` — the single server-side source of
 * truth that the Mongoose validators, the booking engine and the admin config
 * all share.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TIER_THRESHOLDS,
  VISIT_CHARGE_OPTIONS,
  calcCommission,
  calcTier,
  calcTotal,
  normaliseVisitCharge,
  priceBreakdown,
  sanitiseThresholds,
  splitCommission,
} from '../src/utils/tierCalculator';

const LAKH = 100_000;
const CRORE = 10_000_000;

describe('tier thresholds (RULE 1)', () => {
  it('uses the specified defaults: budget < Rs 50L, mid < Rs 1.5Cr', () => {
    assert.equal(DEFAULT_TIER_THRESHOLDS.budget, 5_000_000);
    assert.equal(DEFAULT_TIER_THRESHOLDS.mid, 15_000_000);
  });

  it('classifies the seeded price points correctly', () => {
    // 455 sqft x 4,900 + 90,000 + 150,000 = 2,469,500
    assert.equal(calcTotal(455, 4900, 90_000, 150_000), 2_469_500);
    assert.equal(calcTier(2_469_500), 'budget');

    // 1000 sqft x 7,000 = 70,00,000
    assert.equal(calcTotal(1000, 7000), 7_000_000);
    assert.equal(calcTier(7_000_000), 'mid');

    // 2650 sqft x 13,400 + 600,000 + 600,000 = 36,710,000
    assert.equal(calcTotal(2650, 13400, 600_000, 600_000), 36_710_000);
    assert.equal(calcTier(36_710_000), 'luxury');
  });

  it('treats the boundaries as exclusive upper bounds', () => {
    assert.equal(calcTier(DEFAULT_TIER_THRESHOLDS.budget - 1), 'budget');
    assert.equal(calcTier(DEFAULT_TIER_THRESHOLDS.budget), 'mid');
    assert.equal(calcTier(DEFAULT_TIER_THRESHOLDS.mid - 1), 'mid');
    assert.equal(calcTier(DEFAULT_TIER_THRESHOLDS.mid), 'luxury');
  });

  it('honours admin-configurable thresholds', () => {
    const thresholds = { budget: 40 * LAKH, mid: 80 * LAKH };
    assert.equal(calcTier(39 * LAKH, thresholds), 'budget');
    assert.equal(calcTier(60 * LAKH, thresholds), 'mid');
    assert.equal(calcTier(2 * CRORE, thresholds), 'luxury');
  });

  it('falls back to defaults for nonsense thresholds and keeps budget < mid', () => {
    assert.deepEqual(sanitiseThresholds(undefined), DEFAULT_TIER_THRESHOLDS);
    assert.deepEqual(sanitiseThresholds({ budget: 0, mid: -5 }), DEFAULT_TIER_THRESHOLDS);
    // mid <= budget is rejected and repaired.
    const repaired = sanitiseThresholds({ budget: 20 * LAKH, mid: 10 * LAKH });
    assert.ok(repaired.mid > repaired.budget, 'mid threshold must exceed budget');
  });
});

describe('total price formula (RULE 2)', () => {
  it('is sizeSqft * pricePerSqft + floorRise + parkingCharges', () => {
    assert.equal(calcTotal(1200, 6500, 100_000, 250_000), 1200 * 6500 + 100_000 + 250_000);
  });

  it('treats missing surcharges as zero', () => {
    assert.equal(calcTotal(900, 5500), 900 * 5500);
    assert.equal(calcTotal(900, 5500, undefined, undefined), 900 * 5500);
    assert.equal(calcTotal(900, 5500, 0, 0), 900 * 5500);
  });

  it('produces a full breakdown whose tier matches the total', () => {
    const breakdown = priceBreakdown({ sizeSqft: 1450, pricePerSqft: 8200, floorRise: 75_000, parkingCharges: 300_000 });
    assert.equal(breakdown.baseTotal, 1450 * 8200);
    assert.equal(breakdown.totalPrice, breakdown.baseTotal + 75_000 + 300_000);
    assert.equal(breakdown.tier, calcTier(breakdown.totalPrice));
  });

  it('rounds to whole rupees — money is never fractional', () => {
    const value = calcTotal(999, 7333);
    assert.equal(Number.isInteger(value), true);
  });
});

describe('commission (RULE 3 — token only)', () => {
  it('is 10% of the booking token by default', () => {
    assert.equal(calcCommission(50_000), 5_000);
    assert.equal(calcCommission(1_00_000, 10), 10_000);
  });

  it('is never derived from the property price', () => {
    // A Rs 1.2 Cr flat still only pays commission on the token.
    const token = 50_000;
    const totalPrice = 1.2 * CRORE;
    assert.equal(calcCommission(token), 5_000);
    assert.notEqual(calcCommission(token), totalPrice * 0.1);
  });

  it('respects an admin-configurable percentage', () => {
    assert.equal(calcCommission(200_000, 7.5), 15_000);
    assert.equal(calcCommission(200_000, 0), 0);
  });
});

describe('commission split (RULE 4 — 70/30 default)', () => {
  it('gives the whole commission to the platform when no agent is involved', () => {
    const split = splitCommission(100_000, 10, false);
    assert.equal(split.commissionAmount, 10_000);
    assert.equal(split.platformAmount, 10_000);
    assert.equal(split.agentAmount, 0);
    assert.equal(split.builderAmount, 90_000);
    assert.equal(split.hasAgent, false);
  });

  it('splits 70/30 between platform and agent when an agent is attached', () => {
    const split = splitCommission(100_000, 10, true, 70);
    assert.equal(split.commissionAmount, 10_000);
    assert.equal(split.platformAmount, 7_000);
    assert.equal(split.agentAmount, 3_000);
    assert.equal(split.agentSharePercent, 30);
    assert.equal(split.builderAmount, 90_000);
  });

  it('always conserves the token: builder + platform + agent === token', () => {
    for (const token of [50_000, 99_999, 1_00_000, 2_50_000, 3_33_333]) {
      for (const hasAgent of [false, true]) {
        for (const platformPct of [0, 30, 50, 70, 100]) {
          const s = splitCommission(token, 10, hasAgent, platformPct);
          assert.equal(
            s.builderAmount + s.platformAmount + s.agentAmount,
            token,
            `token ${token} agent=${hasAgent} platformPct=${platformPct}`,
          );
        }
      }
    }
  });

  it('clamps an out-of-range platform percentage', () => {
    assert.equal(splitCommission(100_000, 10, true, 150).platformAmount, 10_000);
    assert.equal(splitCommission(100_000, 10, true, -20).platformAmount, 0);
  });
});

describe('site visit charges', () => {
  it('only allows the published options', () => {
    assert.deepEqual([...VISIT_CHARGE_OPTIONS], [0, 199, 499]);
    for (const option of VISIT_CHARGE_OPTIONS) {
      assert.equal(normaliseVisitCharge(option), option);
    }
  });

  it('falls back to free for any unpublished amount', () => {
    assert.equal(normaliseVisitCharge(100), 0);
    assert.equal(normaliseVisitCharge(200), 0);
    assert.equal(normaliseVisitCharge(undefined), 0);
    assert.equal(normaliseVisitCharge(null), 0);
  });
});
