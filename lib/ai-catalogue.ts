import type { BuilderStep, BuilderProduct } from "@/lib/data/customer/bike-builder";

/** A request-specific shortlist; the database and manual builder keep every product. */
export function compactAiCatalogue(steps: BuilderStep[], prompt: string, maxBytes = 8_000) {
  const terms = [...new Set(prompt.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? [])];
  const compact = (p: BuilderProduct) => ({
    id: p.id,
    name: p.name.slice(0, 100),
    price: p.price,
    specs: JSON.stringify(p.specs ?? {}).slice(0, 240),
  });
  const rank = (p: BuilderProduct) => {
    const text = `${p.name} ${JSON.stringify(p.specs ?? {})} ${p.description ?? ""}`.toLowerCase();
    return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
  };
  const candidates = steps.map(step => [...step.products].sort(
    (a, b) => rank(b) - rank(a) || a.price - b.price || a.id.localeCompare(b.id)
  ));
  // Preserve a cheapest option for every step so shortlisting does not discard
  // the minimum-cost build. The model can still decline unsuitable products.
  const catalogue = steps.map(step => {
    const cheapest = [...step.products].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0];
    return { stepNumber: step.stepNumber, category: step.name.slice(0, 60), products: cheapest ? [compact(cheapest)] : [] };
  });
  const bytes = () => Buffer.byteLength(JSON.stringify(catalogue), "utf8");
  // Reduce long specification excerpts first, without removing a whole step.
  if (bytes() > maxBytes) for (const step of catalogue) for (const p of step.products) p.specs = p.specs.slice(0, 60);
  if (bytes() > maxBytes) return null;
  // Round-robin additions prevent early categories consuming the whole budget.
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < catalogue.length; i++) {
      const step = catalogue[i];
      const candidate = candidates[i].find(p => !step.products.some(item => item.id === p.id));
      if (!candidate) continue;
      step.products.push(compact(candidate));
      if (bytes() > maxBytes) step.products.pop();
    }
  }
  return catalogue;
}
