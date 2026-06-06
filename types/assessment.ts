import type { Period } from '@/lib/ll97/coefficients';
import type { EnergyUse } from '@/lib/ll97/emissions';
import type { SpaceUse } from '@/lib/ll97/limit';
import type { Fine } from '@/lib/ll97/fine';

export type { Period };

export interface BuildingInfo {
  bbl: string; bin?: string; address: string; lat?: number; lon?: number;
  gfa: number; useTypes: SpaceUse[]; primaryType: string; reportYear: number;
  dataSource: 'benchmarking' | 'manual' | 'estimate';
}

export interface AssessmentInput {
  building: BuildingInfo;
  energy: EnergyUse & { reportedGHG_tCO2e?: number };
  flags?: string[];
}

export interface BuildingAssessment {
  building: BuildingInfo;
  energy: AssessmentInput['energy'];
  emissions: { method: 'fuel' | 'reported'; byPeriod: Record<Period, number> };
  limits: Record<Period, number>;
  fines: Record<Period, Fine>;
  covered: boolean;
  pathway: 'article320' | 'likely-article321';
  flags: string[];
}
