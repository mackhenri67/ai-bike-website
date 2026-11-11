
import { optionKey } from "@/lib/product-options";
import type { CategoryAxis } from "./categoryConfig";

export type RetailerReference = {productId?:string;slug:string;name:string;sourceTitle:string;sourceUrl:string; options:{name:string;values:string[]}[]; combinations:Record<string,string>[]};
export function getRetailerReference(slug: string, name: string, references: RetailerReference[], productId?:string): RetailerReference | undefined {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return references.find(p => productId && p.productId ? p.productId === productId : p.slug === slug || normalized(p.name) === normalized(name));
}

const aliases: Record<string, string[]> = {
  width: ["handlebarwidthcc", "handlebarwidthcentretocentre"],
  rim: ["rimdepth", "rimheight", "rimheightordepth"],
  freehub: ["freehubtype", "freehubbodystandard"],
  length: ["stemlength", "cranklength", "seatpostlength"],
  steerer: ["steerertubesize"],
  diameter: ["diameter", "seatpostdiameter"],
  size: ["size", "tiresize", "rotorsize"],
};
export function referenceAxes(reference: RetailerReference | undefined, category: CategoryAxis[]) {
  if (!reference) return [];
  return reference.options.map(option => {
    const key = option.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = category.find(axis => axis.label.toLowerCase().replace(/[^a-z0-9]/g, "") === key || aliases[axis.flag]?.includes(key));
    return {source: option.name, axis: existing ?? {flag: option.name, field: option.name, label: option.name, hint: "Choices listed by the linked retailer; shop stock is separate.", presets: [], placeholder: "Add verified value"}, values: option.values};
  });
}

export function missingReferenceCombinations(reference: RetailerReference, category: CategoryAxis[], existing: {options: Record<string,string>}[], unallocatedStock: number) {
  const fields = referenceAxes(reference, category);
  if (!fields.length || !reference.combinations.length) throw new Error("This source lists a fixed configuration, not selectable variations.");
  if (!existing.length && unallocatedStock > 0) throw new Error("This product has unallocated shop stock. First create its existing stocked configuration and save it. Then import missing combinations; its stock must not be guessed.");
  const labels = fields.map(field => field.axis.label).sort();
  if (existing.some(row => JSON.stringify(Object.keys(row.options).sort()) !== JSON.stringify(labels))) throw new Error("Existing combinations use different fields. Match their actual configuration to the source fields before importing; nothing was changed.");
  const seen = new Set(existing.map(row => optionKey(row.options)));
  const additions: Record<string,string>[] = [];
  for (const combination of reference.combinations) {
    const values = combination as Record<string,string>;
    const row = Object.fromEntries(fields.map(field => [field.axis.label, values[field.source]]));
    if (Object.values(row).some(value => !value)) throw new Error("The source combination is incomplete.");
    const key = optionKey(row);
    if (!seen.has(key)) { additions.push(row); seen.add(key); }
  }
  if (existing.length + additions.length > 200) throw new Error("This import would exceed the 200-combination limit.");
  return additions;
}
