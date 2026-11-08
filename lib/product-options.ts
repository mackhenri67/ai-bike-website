export type OptionValues = Record<string, string>;
export function optionKey(options: OptionValues): string {
  return JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));
}
export function optionLabel(options: OptionValues): string {
  return Object.entries(options).map(([key, value]) => `${key}: ${value}`).join(" · ");
}
export function legacyOptions(row: { options?: OptionValues; size?: string | null; color?: string | null }): OptionValues {
  if (row.options && Object.keys(row.options).length) return row.options;
  return { ...(row.size ? { Size: row.size } : {}), ...(row.color ? { Color: row.color } : {}) };
}
export function optionAxes(rows: { options: OptionValues }[]) {
  const axes = new Map<string, Set<string>>();
  for (const row of rows) for (const [label, value] of Object.entries(row.options)) {
    if (!axes.has(label)) axes.set(label, new Set());
    axes.get(label)!.add(value);
  }
  return [...axes].map(([label, values]) => ({ label, options: [...values] }));
}
export function matchOptions(rows: { options: OptionValues; available?: boolean; stock: number }[], picks: OptionValues) {
  return rows.find((row) => row.available !== false && row.stock > 0 && optionKey(row.options) === optionKey(picks));
}
