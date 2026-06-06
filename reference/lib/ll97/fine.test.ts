import { describe, it, expect } from 'vitest';
import { computeFine } from './fine';

describe('computeFine', () => {
  it('is $0 when emissions are under the limit (DOB example: 287.00 < 302.41)', () => {
    const f = computeFine(287.0, 302.41);
    expect(f.excess_tCO2e).toBe(0);
    expect(f.annual_usd).toBe(0);
  });
  it('charges $268 per ton over the cap', () => {
    const f = computeFine(400, 302.41);
    expect(f.excess_tCO2e).toBeCloseTo(97.59, 2);
    expect(f.annual_usd).toBeCloseTo(26154.12, 2);
  });
});
