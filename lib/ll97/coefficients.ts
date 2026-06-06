export type Period = '2024-2029' | '2030-2034' | '2035-2039';
export const PERIODS: Period[] = ['2024-2029', '2030-2034', '2035-2039'];

// Penalty: $268 per metric ton CO2e per year over the cap. (DOB §28-320.6)
export const PENALTY_USD_PER_TON = 268;

// Grid electricity continues to ~0 by 2040 (LL97 horizon beyond this model's fine periods).
// tCO2e per unit. electricity is per kWh; gas/oil/steam per kBtu. (DOB §28-320.3.1.1)
export const FUEL_COEFFICIENTS: Record<Period, {
  electricity_kWh: number; naturalGas_kBtu: number;
  fuelOil2_kBtu: number; fuelOil4_kBtu: number; districtSteam_kBtu: number;
}> = {
  '2024-2029': { electricity_kWh: 0.000288962, naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.00004493 },
  '2030-2034': { electricity_kWh: 0.000145,     naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.00004320 },
  '2035-2039': { electricity_kWh: 0.0000866886, naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.00003200 },
};

// 1 therm = 100 kBtu
export const KBTU_PER_THERM = 100;

// Per-property-type GHG emission limits (tCO2e/sf), verbatim from 1 RCNY §103-14(c)(3).
// Verified against the live NYC DOB rule PDF (SHA-256 identical, 0/180 cell mismatches).
interface EspmLimit { espmType: string; occupancyGroup?: string; f2024: number; f2030: number; f2035: number; }
const ESPM_LIMITS: EspmLimit[] = [
  { espmType: 'Adult Education', f2024: 0.00758, f2030: 0.003565528, f2035: 0.002674146 },
  { espmType: 'Ambulatory Surgical Center', f2024: 0.01181, f2030: 0.008980612, f2035: 0.006735459 },
  { espmType: 'Automobile Dealership', f2024: 0.00675, f2030: 0.002824097, f2035: 0.002118072 },
  { espmType: 'Bank Branch', f2024: 0.00987, f2030: 0.004036172, f2035: 0.003027129 },
  { espmType: 'Bowling Alley', f2024: 0.00574, f2030: 0.003103815, f2035: 0.002327861 },
  { espmType: 'College/University', f2024: 0.00987, f2030: 0.002099748, f2035: 0.001236322 },
  { espmType: 'Convenience Store without Gas Station', f2024: 0.00675, f2030: 0.003540032, f2035: 0.002655024 },
  { espmType: 'Courthouse', f2024: 0.00426, f2030: 0.001480533, f2035: 0.0011104 },
  { espmType: 'Data Center', f2024: 0.02381, f2030: 0.014791131, f2035: 0.011093348 },
  { espmType: 'Distribution Center', f2024: 0.00574, f2030: 0.0009916, f2035: 0.000549637 },
  { espmType: 'Enclosed Mall', f2024: 0.01074, f2030: 0.003983803, f2035: 0.002987852 },
  { espmType: 'Financial Office', f2024: 0.00846, f2030: 0.003697004, f2035: 0.002772753 },
  { espmType: 'Fitness Center/Health Club/Gym', f2024: 0.00987, f2030: 0.003946728, f2035: 0.002960046 },
  { espmType: 'Food Sales', f2024: 0.01181, f2030: 0.00520888, f2035: 0.00390666 },
  { espmType: 'Food Service', f2024: 0.01181, f2030: 0.007749414, f2035: 0.00581206 },
  { espmType: 'Hospital (General Medical & Surgical)', f2024: 0.02381, f2030: 0.007335204, f2035: 0.004654044 },
  { espmType: 'Hotel', f2024: 0.00987, f2030: 0.003850668, f2035: 0.002640017 },
  { espmType: 'K-12 School', f2024: 0.00675, f2030: 0.002230588, f2035: 0.001488109 },
  { espmType: 'Laboratory', f2024: 0.02381, f2030: 0.026029868, f2035: 0.019522401 },
  { espmType: 'Library', f2024: 0.00675, f2030: 0.002218412, f2035: 0.001663809 },
  { espmType: 'Lifestyle Center', f2024: 0.00846, f2030: 0.00470585, f2035: 0.003529387 },
  { espmType: 'Mailing Center/Post Office', f2024: 0.00426, f2030: 0.00198044, f2035: 0.00148533 },
  { espmType: 'Manufacturing/Industrial Plant', f2024: 0.00758, f2030: 0.00141703, f2035: 0.000975993 },
  { espmType: 'Medical Office', f2024: 0.01074, f2030: 0.002912778, f2035: 0.001683565 },
  { espmType: 'Movie Theater', f2024: 0.01181, f2030: 0.005395268, f2035: 0.004046451 },
  { espmType: 'Multifamily Housing', occupancyGroup: 'R-2', f2024: 0.00675, f2030: 0.00334664, f2035: 0.002692183 },
  { espmType: 'Museum', f2024: 0.01181, f2030: 0.0053958, f2035: 0.00404685 },
  { espmType: 'Non-Refrigerated Warehouse', f2024: 0.00426, f2030: 0.000883187, f2035: 0.000568051 },
  { espmType: 'Office', f2024: 0.00758, f2030: 0.002690852, f2035: 0.00165234 },
  { espmType: 'Other - Education', f2024: 0.00846, f2030: 0.002934006, f2035: 0.001867699 },
  { espmType: 'Other - Entertainment/Public Assembly', f2024: 0.00987, f2030: 0.002956738, f2035: 0.002250122 },
  { espmType: 'Other - Lodging/Residential', f2024: 0.00758, f2030: 0.001901982, f2035: 0.001329089 },
  { espmType: 'Other - Mall', f2024: 0.01074, f2030: 0.001928226, f2035: 0.001006426 },
  { espmType: 'Other - Public Services', f2024: 0.00758, f2030: 0.003808033, f2035: 0.002856025 },
  { espmType: 'Other - Recreation', f2024: 0.00987, f2030: 0.00447957, f2035: 0.003359678 },
  { espmType: 'Other - Restaurant/Bar', f2024: 0.02381, f2030: 0.008505075, f2035: 0.006378806 },
  { espmType: 'Other - Services', f2024: 0.01074, f2030: 0.001823381, f2035: 0.001367536 },
  { espmType: 'Other - Specialty Hospital', f2024: 0.02381, f2030: 0.006321819, f2035: 0.004741365 },
  { espmType: 'Other - Technology/Science', f2024: 0.02381, f2030: 0.010446456, f2035: 0.007834842 },
  { espmType: 'Outpatient Rehabilitation/Physical Therapy', f2024: 0.01181, f2030: 0.006018323, f2035: 0.004513742 },
  { espmType: 'Parking', occupancyGroup: 'U', f2024: 0.00426, f2030: 0.000214421, f2035: 0.000104943 },
  { espmType: 'Performing Arts', f2024: 0.00846, f2030: 0.002472539, f2035: 0.001399345 },
  { espmType: 'Personal Services (Health/Beauty, Dry Cleaning, etc.)', f2024: 0.00574, f2030: 0.004843037, f2035: 0.003632278 },
  { espmType: 'Pre-school/Daycare', f2024: 0.00675, f2030: 0.002362874, f2035: 0.001772155 },
  { espmType: 'Refrigerated Warehouse', f2024: 0.00987, f2030: 0.002852131, f2035: 0.002139098 },
  { espmType: 'Repair Services (Vehicle, Shoe, Locksmith, etc.)', f2024: 0.00426, f2030: 0.002210699, f2035: 0.001658024 },
  { espmType: 'Residence Hall/Dormitory', f2024: 0.00758, f2030: 0.002464089, f2035: 0.001332459 },
  { espmType: 'Residential Care Facility', f2024: 0.01138, f2030: 0.004893124, f2035: 0.004027812 },
  { espmType: 'Restaurant', f2024: 0.01181, f2030: 0.004038374, f2035: 0.00302878 },
  { espmType: 'Retail Store', f2024: 0.00758, f2030: 0.00210449, f2035: 0.00121605 },
  { espmType: 'Self-Storage Facility', f2024: 0.00426, f2030: 0.00061183, f2035: 0.000404901 },
  { espmType: 'Senior Care Community', f2024: 0.01138, f2030: 0.004410123, f2035: 0.003336443 },
  { espmType: 'Social/Meeting Hall', f2024: 0.00987, f2030: 0.003833108, f2035: 0.002874831 },
  { espmType: 'Strip Mall', f2024: 0.01181, f2030: 0.001361842, f2035: 0.000600493 },
  { espmType: 'Supermarket/Grocery Store', f2024: 0.02381, f2030: 0.00675519, f2035: 0.004256103 },
  { espmType: 'Transportation Terminal/Station', f2024: 0.00426, f2030: 0.000571669, f2035: 0.000428752 },
  { espmType: 'Urgent Care/Clinic/Other Outpatient', f2024: 0.01181, f2030: 0.005772375, f2035: 0.004329281 },
  { espmType: 'Vocational School', f2024: 0.00574, f2030: 0.004613122, f2035: 0.003459842 },
  { espmType: 'Wholesale Club/Supercenter', f2024: 0.01138, f2030: 0.004264962, f2035: 0.003198721 },
  { espmType: 'Worship Facility', f2024: 0.00574, f2030: 0.001230602, f2035: 0.000866921 },
];

export const EMISSIONS_FACTORS: Record<Period, Record<string, number>> = {
  '2024-2029': Object.fromEntries(ESPM_LIMITS.map(r => [r.espmType, r.f2024])),
  '2030-2034': Object.fromEntries(ESPM_LIMITS.map(r => [r.espmType, r.f2030])),
  '2035-2039': Object.fromEntries(ESPM_LIMITS.map(r => [r.espmType, r.f2035])),
};

// Common LL84 property-type labels that differ from the rule's ESPM keys.
export const PROPERTY_TYPE_ALIASES: Record<string, string> = {
  'Senior Living Community': 'Senior Care Community',
  'Vehicle Dealership': 'Automobile Dealership',
  'Vehicle Repair Services': 'Repair Services (Vehicle, Shoe, Locksmith, etc.)',
  'Repair Services': 'Repair Services (Vehicle, Shoe, Locksmith, etc.)',
  'Bar/Nightclub': 'Other - Restaurant/Bar',
  'Restaurant/Bar': 'Other - Restaurant/Bar',
  'Community Center': 'Social/Meeting Hall',
  'Social Meeting Hall': 'Social/Meeting Hall',
  'Convenience Store with Gas Station': 'Convenience Store without Gas Station',
  'Mailing Center/Post Office (Non-Operational)': 'Mailing Center/Post Office',
  'Personal Services (Health/Beauty, Dry Cleaning, etc)': 'Personal Services (Health/Beauty, Dry Cleaning, etc.)',
  'Fitness Center/Health Club/Gym ': 'Fitness Center/Health Club/Gym',
};
