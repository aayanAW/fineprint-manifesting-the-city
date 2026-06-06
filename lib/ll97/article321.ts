import type { BuildingAssessment } from '@/types/assessment';

export interface PECM { n: number; measure: string; }
export const PECM_CHECKLIST: PECM[] = [
  { n: 1, measure: 'Adjust temperature set points to avoid overheating' },
  { n: 2, measure: 'Repair heating system leaks' },
  { n: 3, measure: 'Maintain and repair heating system components' },
  { n: 4, measure: 'Add radiator or individual temperature controls / insulated enclosures' },
  { n: 5, measure: 'Insulate exposed heating and hot-water pipes' },
  { n: 6, measure: 'Insulate hot-water storage tanks' },
  { n: 7, measure: 'Install indoor and outdoor temperature sensors' },
  { n: 8, measure: 'Repair or replace steam traps' },
  { n: 9, measure: 'Install or repair master steam venting' },
  { n: 10, measure: 'Upgrade lighting to code (LED)' },
  { n: 11, measure: 'Seal and weatherize the building envelope' },
  { n: 12, measure: 'Install timers or controls on exhaust fans' },
  { n: 13, measure: 'Install radiant barriers behind radiators' },
];

export interface Article321View {
  pecms: PECM[];
  target2030_tCO2e: number;
  current_tCO2e: number;
  meets2030: boolean;
}

/** Article 321 path: no per-ton penalty in 2024-2029 if prescriptive measures are done;
 * performance path = 2024 emissions already meet the 2030 (Article 320) limit. */
export function article321View(a: BuildingAssessment): Article321View {
  const current = a.emissions.byPeriod['2024-2029'] ?? 0;
  const target = a.limits['2030-2034'] ?? 0;
  return { pecms: PECM_CHECKLIST, target2030_tCO2e: target, current_tCO2e: current, meets2030: target > 0 && current <= target };
}
