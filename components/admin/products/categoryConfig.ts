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
const builderSteps: Record<string, number> = {
  frameset: 1,
  handlebar: 2,
  "bar-tape-grips": 3,
  stem: 4,
  seatpost: 5,
  saddle: 6,
  wheelset: 7,
  tires: 8,
  groupset: 9,
  pedals: 10,
};
export function getCategoryAxes(slug: string | null | undefined, axes?: CategoryAxis[] | null): CategoryAxis[] { return axes ?? []; }
export function getCategoryNote(): string { return ""; }
export function getStepNumber(slug: string | null | undefined): number | null { return slug ? builderSteps[slug] ?? null : null; }
