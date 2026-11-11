export interface CategoryAxis {
  flag: string;
  field: string;
  label: string;
  hint: string;
  presets: string[];
  placeholder: string;
}

export interface CategoryConfig {
  note: string;
  /** 1-based step number in the Bike Builder, or undefined for non-builder categories. */
  stepNumber?: number;
  axes: CategoryAxis[];
}

// Builder navigation mapping only; customization values are stored in Supabase.
const builderSteps: Record<string, number> = {"frameset": 1, "handlebar": 2, "stem": 3, "seatpost": 4, "saddle": 5, "wheelset": 6, "tires": 7, "front-derailleur": 8, "rear-derailleur": 9, "crankset": 10, "cassette": 11, "chain": 12, "brakeset": 13, "rotors": 14, "pedals": 15};
export function getCategoryAxes(slug: string | null | undefined, axes?: CategoryAxis[] | null): CategoryAxis[] { return axes ?? []; }
export function getCategoryNote(): string { return ""; }
export function getStepNumber(slug: string | null | undefined): number | null { return slug ? builderSteps[slug] ?? null : null; }
