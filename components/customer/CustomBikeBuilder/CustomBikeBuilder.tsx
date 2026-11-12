"use client";
import { useRouter } from "next/navigation";
import { saveDirectCheckout } from "../direct-checkout";
import type { AddToCartInput } from "../cart-store";
import { legacyOptions } from "@/lib/product-options";
import { builderAxes, builderVariant } from "@/lib/builder-options";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "../CartContext";
import { formatPeso, PRODUCT_PLACEHOLDER_SRC } from "../data";
import type {
  BuilderStep,
  BuilderProduct,
} from "@/lib/data/customer/bike-builder";
import styles from "./CustomBikeBuilder.module.css";

/**
 * "Custom Bike Builder" — a 10-step product configurator.
 *
 * Flow:
 *   1. Landing   – hero, price, optional AI prompt + the 10-part checklist,
 *                  then "Start building".
 *   2. Builder   – steps 1..10. For each step the customer picks one part and
 *                  answers that part's customization axes (size/colour, etc.).
 *   3. Review    – the full 10-part build with line total + grand total.
 *
 * On "Add to cart" every chosen part becomes its own cart line, so the whole
 * build appears alongside normal storefront items in the existing cart,
 * checkout and order pipeline (the selected axes are carried on the existing
 * size/color fields — no new cart machinery needed).
 *
 * All step + product data is passed in from the server component
 * (`getBikeBuilderSteps`), never hardcoded here.
 */

type View = "landing" | "builder" | "review";

/** A completed choice for one step. */
type Selection = {
  /** Chosen product for this step. */
  product: BuilderProduct;
  /** axis label → chosen option string. */
  axisValues: Record<string, string>;
  /** Cleared if the customer replaces the suggested product. */
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAvailableProduct(value: unknown): value is BuilderProduct {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    (value.description === null || typeof value.description === "string") &&
    Array.isArray(value.specs) &&
    value.specs.every((spec: unknown) => typeof spec === "string") &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    value.price >= 0 &&
    (value.compareAtPrice === null ||
      (typeof value.compareAtPrice === "number" &&
        Number.isFinite(value.compareAtPrice))) &&
    typeof value.stock === "number" &&
    Number.isFinite(value.stock) &&
    value.stock > 0 &&
    (value.image === null || typeof value.image === "string")
  );
}

function hasChosenOptions(step: BuilderStep, selection?: Selection): boolean {
  return Boolean(
    selection &&
      selection.product.stock > 0 &&
      (!selection.product.variants?.length ||
        Boolean(builderVariant(selection.product, selection.axisValues))) &&
      builderAxes(step, selection.product).every(
        (axis) =>
          axis.options.length === 0 ||
          axis.options.includes(selection.axisValues[axis.label]),
      ),
  );
}

const AI_SUGGESTIONS = [
  "Aggressive downhill, I ride in the rain, 5'10\"",
  "Weekend trails on a tight budget",
  "Racing cross-country, lightest possible",
];

export default function CustomBikeBuilder({
  steps,
  stepsError,
}: {
  steps: BuilderStep[];
  stepsError: string | null;
}) {
  const { addItem } = useCart();
  const router = useRouter();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [view, setView] = useState<View>("landing");
  const [currentStep, setCurrentStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  // stepNumber -> Selection
  const [selections, setSelections] = useState<Record<number, Selection>>({});
  const [added, setAdded] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiNotice, setAiNotice] = useState("");

  const orderedSteps = useMemo(
    () => [...steps].sort((a, b) => a.stepNumber - b.stepNumber),
    [steps],
  );

  const startBuilding = () => {
    // Pre-select the first in-stock product + first axis option on every step
    // so the customer can jump straight in and refine as they go.
    const initial: Record<number, Selection> = {};
    for (const step of orderedSteps) {
      const firstInStock = step.products.find((p) => p.stock > 0);
      if (!firstInStock) continue;
      const values: Record<string, string> = {};
      for (const axis of builderAxes(step, firstInStock)) {
        if (axis.options.length > 0) values[axis.label] = axis.options[0];
      }
      const firstChoice = firstInStock.variants?.find((v) => v.available && v.stock > 0);
      if (firstChoice) Object.assign(values, legacyOptions(firstChoice));
      initial[step.stepNumber] = {
        product: (() => {
          const v = builderVariant(firstInStock, values);
          return v
            ? {
                ...firstInStock,
                price: v.price,
                stock: Math.min(
                  firstInStock.catalogueStock ?? firstInStock.stock,
                  v.stock,
                ),
              }
            : firstInStock;
        })(),
        axisValues: values,
      };
    }
    setAiGenerated(false);
    setAiError(null);
    setLoginRequired(false);
    setAiExplanation("");
    setAiNotice("");
    setSelections(initial);
    setCurrentStep(0);
    setAdded(false);
    setView(orderedSteps.length > 0 ? "builder" : "review");
  };

  const changeAxis = (stepNumber: number, label: string, value: string) => {
    setAdded(false);
    setSelections((previous) => {
      const selection = previous[stepNumber];
      if (!selection) return previous;
      const step = orderedSteps.find((item) => item.stepNumber === stepNumber)!;
      const axes = builderAxes(step, selection.product);
      const index = axes.findIndex((axis) => axis.label === label);
      const candidate = selection.product.variants?.find((row) => row.available && row.stock > 0 && legacyOptions(row)[label] === value && axes.slice(0, index).every((axis) => legacyOptions(row)[axis.label] === selection.axisValues[axis.label]));
      const picks = candidate ? legacyOptions(candidate) : { ...selection.axisValues, [label]: value };
      const v = builderVariant(selection.product, picks);
      return { ...previous, [stepNumber]: { ...selection, axisValues: picks, product: v ? { ...selection.product, price: v.price, stock: Math.min(selection.product.catalogueStock ?? selection.product.stock, v.stock) } : selection.product } };

    });
  };

  const requestAiBuild = async () => {
    if (aiLoading) return;
    setAiError(null);
    setLoginRequired(false);
    const riderPrompt = prompt.trim();
    if (riderPrompt.length < 3 || riderPrompt.length > 2_000) {
      setAiError(
        "Describe how and where you ride using 3 to 2,000 characters.",
      );
      return;
    }
    const budget = budgetInput.trim() === "" ? null : Number(budgetInput);
    if (
      budget !== null &&
      (!Number.isFinite(budget) ||
        budget <= 0 ||
        !Number.isSafeInteger(Math.round(budget * 100)))
    ) {
      setAiError("Enter a positive parts budget in pesos, or leave it empty.");
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch("/api/bike-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt: riderPrompt, budget }),
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("The AI builder is unavailable. Please try again.");
      }
      if (!response.ok) {
        setLoginRequired(response.status === 401);
        let message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "The AI builder could not complete your request.";
        if (isRecord(data) && Array.isArray(data.missingSteps)) {
          const missing = data.missingSteps.filter(
            (name: unknown): name is string => typeof name === "string",
          );
          if (missing.length > 0)
            message += " Unavailable parts: " + missing.join(", ") + ".";
        }
        if (
          response.status === 429 &&
          isRecord(data) &&
          typeof data.retryAfter === "number" &&
          Number.isFinite(data.retryAfter) &&
          data.retryAfter > 0
        ) {
          message +=
            " Try again in " + Math.ceil(data.retryAfter) + " seconds.";
        }
        throw new Error(message);
      }
      if (
        !isRecord(data) ||
        !Array.isArray(data.selections) ||
        data.selections.length !== orderedSteps.length
      ) {
        throw new Error(
          "The AI builder did not return a complete recommendation.",
        );
      }

      const suggested: Record<number, Selection> = {};
      for (const choice of data.selections) {
        if (
          !isRecord(choice) ||
          typeof choice.stepNumber !== "number" ||
          !Number.isInteger(choice.stepNumber) ||
          typeof choice.productId !== "string" ||
          typeof choice.reason !== "string" ||
          !isAvailableProduct(choice.product) ||
          choice.product.id !== choice.productId ||
          suggested[choice.stepNumber]
        ) {
          throw new Error(
            "The AI builder returned an invalid selection. Please try again.",
          );
        }
        const step = orderedSteps.find(
          (item) => item.stepNumber === choice.stepNumber,
        );
        if (
          !step ||
          !step.products.some((product) => product.id === choice.productId)
        ) {
          throw new Error(
            "The catalogue has changed. Refresh the page and request a new build.",
          );
        }
        suggested[choice.stepNumber] = {
          product: choice.product,
          // Product suggestions do not establish the customer's size or fit.
          axisValues: {},
          reason: choice.reason.trim().slice(0, 500),
        };
      }

      setSelections(suggested);
      setAiExplanation(
        typeof data.explanation === "string"
          ? data.explanation.slice(0, 1_000)
          : "",
      );
      setAiNotice(
        typeof data.compatibilityNotice === "string"
          ? data.compatibilityNotice.slice(0, 1_000)
          : "Have the shop confirm mechanical compatibility, sizes, and final fit before assembly.",
      );
      setAiGenerated(true);
      setCurrentStep(0);
      setAdded(false);
      setView("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setAiError(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "The AI builder could not be reached. Please try again.",
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (stepsError) {
    return (
      <main className={styles.page}>
        <div className={styles.message}>
          <h1 className={styles.title}>Custom Bike Builder</h1>
          <p className={styles.errorText}>{stepsError}</p>
        </div>
      </main>
    );
  }

  if (steps.length === 0) {
    return (
      <main className={styles.page}>
        <div className={styles.message}>
          <h1 className={styles.title}>Custom Bike Builder</h1>
          <p className={styles.errorText}>
            The bike builder isn&apos;t set up yet. Please check back soon.
          </p>
        </div>
      </main>
    );
  }

  // ---- Landing -------------------------------------------------------------
  if (view === "landing") {
    return (
      <main className={styles.page}>
        <div className={styles.column}>
          <h1 className={styles.title}>Custom Bike Builder</h1>
          <p className={styles.lead}>
            A hand-built alloy trail platform tuned in our Tabaco City workshop.
            Pick your fit, finish and parts — we assemble, tune and ship it
            ride-ready.
          </p>

          <div className={styles.hero}>
            <Image
              src="/Customerpageimages/image1forbikecustomize.png"
              alt="Custom-built alloy trail bike"
              fill
              sizes="(max-width: 760px) 100vw, 720px"
              className={styles.heroImg}
              priority
            />
          </div>

          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>Starts at</span>
            <span className={styles.priceValue}>
              {formatPeso(
                orderedSteps.reduce(
                  (sum, step) =>
                    sum + (step.products.find((p) => p.stock > 0)?.price ?? 0),
                  0,
                ),
              )}
            </span>
          </div>

          {/* AI builder (optional) */}
          <section className={styles.aiCard} aria-busy={aiLoading}>
            <div className={styles.aiHead}>
              <svg
                className={styles.aiIcon}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"
                  fill="currentColor"
                />
              </svg>
              <span className={styles.aiTitle}>Let AI build it for you</span>
              <span className={styles.optional}>Optional</span>
            </div>

            <p className={styles.aiDesc}>
              Describe your terrain, weather, height, and riding needs. AI will
              suggest available parts for you to review. You can set your sizes
              and colours before adding the build to your cart.
            </p>

            <div className={styles.textarea}>
              <textarea
                className={styles.textareaInput}
                placeholder="e.g. Rocky enduro trails, wet season, 175cm, mid budget"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                aria-label="Describe how and where you ride"
                maxLength={2_000}
                disabled={aiLoading}
              />
            </div>

            <label className={styles.budgetField}>
              <span className={styles.axisLabel}>
                Maximum parts budget (₱, optional)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={budgetInput}
                onChange={(event) => setBudgetInput(event.target.value)}
                className={styles.budgetInput}
                placeholder="For example, 50000"
                aria-label="Maximum parts budget (PHP)"
                disabled={aiLoading}
              />
            </label>

            <div className={styles.chips}>
              {AI_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.chip}
                  onClick={() => setPrompt(suggestion)}
                  disabled={aiLoading}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.buildBtn}
              onClick={requestAiBuild}
              disabled={aiLoading}
            >
              <svg
                className={styles.buildIcon}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"
                  fill="currentColor"
                />
              </svg>
              {aiLoading ? "Building your recommendation…" : "Build it for me"}
            </button>
            {aiLoading ? (
              <p className={styles.aiDesc} role="status">
                Choosing parts from the available catalogue. This may take a
                moment.
              </p>
            ) : null}
            {aiError ? (
              <p className={styles.errorText} role="alert">
                {aiError}
                {loginRequired ? (
                  <>
                    {" "}
                    <Link href="/login?next=%2Fcustom-bike-builder">
                      Sign in to request a build
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
          </section>

          <h2 className={styles.partsHeading}>Choose the parts yourself</h2>
          <ul className={styles.partsList}>
            {orderedSteps.map((step) => (
              <li className={styles.partItem} key={step.stepNumber}>
                <span className={styles.partBadge} aria-hidden="true">
                  {step.stepNumber}
                </span>
                <div className={styles.partBody}>
                  <p className={styles.partTitle}>{step.name}</p>
                  <p className={styles.partDesc}>{step.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className={styles.note}>
            You can go back and change anything before checkout.
          </p>

          <button
            type="button"
            className={styles.startBuilding}
            onClick={startBuilding}
            disabled={aiLoading}
          >
            Start building
            <svg
              className={styles.startArrow}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 12 H19 M13 6 L19 12 L13 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </main>
    );
  }

  // ---- Builder -------------------------------------------------------------
  if (view === "builder") {
    const step = orderedSteps[currentStep];
    const selection = selections[step.stepNumber];
    const isLast = currentStep === orderedSteps.length - 1;
    const canContinue = hasChosenOptions(step, selection);
    const products =
      selection &&
      !step.products.some((product) => product.id === selection.product.id)
        ? [selection.product, ...step.products]
        : step.products.map((product) =>
            product.id === selection?.product.id ? selection.product : product,
          );

    const chooseProduct = (product: BuilderProduct) => {
      setAdded(false);
      const first = product.variants?.find((row) => row.available && row.stock > 0);
      if (first) product = { ...product, price: first.price, stock: Math.min(product.catalogueStock ?? product.stock, first.stock) };
      setAiExplanation("");
      setSelections((prev) => ({
        ...prev,
        [step.stepNumber]: {
          product,
          axisValues: product.variants?.find((v) => v.available && v.stock > 0) ? legacyOptions(product.variants.find((v) => v.available && v.stock > 0)!) : {},
        },
      }));
    };

    const handleNext = () => {
      if (!canContinue) return;
      if (isLast) {
        setView("review");
      } else {
        setCurrentStep((i) => i + 1);
      }
    };

    return (
      <main className={styles.page}>
        <div className={styles.column}>
          {/* Progress */}
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>
              Step {currentStep + 1} of {orderedSteps.length}
            </span>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((currentStep + 1) / orderedSteps.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Step heading */}
          <h1 className={styles.stepTitle}>
            {step.stepNumber}. {step.name}
          </h1>
          <p className={styles.stepDesc}>{step.description}</p>
          {step.notice ? (
            <p className={styles.stepNotice}>{step.notice}</p>
          ) : null}

          {/* Product options */}
          <div className={styles.productGrid}>
            {products.map((product) => {
              const active = selection?.product.id === product.id;
              const outOfStock = product.stock <= 0;
              const onSale =
                product.compareAtPrice !== null &&
                product.compareAtPrice > product.price;
              return (
                <button
                  key={product.id}
                  type="button"
                  className={
                    active ? styles.productCardActive : styles.productCard
                  }
                  onClick={() => chooseProduct(product)}
                  aria-pressed={active}
                  disabled={outOfStock}
                >
                  <div className={styles.productImage}>
                    <Image
                      src={product.image ?? PRODUCT_PLACEHOLDER_SRC}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 45vw, 220px"
                      className={styles.productImg}
                    />
                    {onSale ? (
                      <span className={styles.saleBadge}>Sale</span>
                    ) : null}
                  </div>
                  <div className={styles.productBody}>
                    <h3 className={styles.productName}>{product.name}</h3>
                    {product.description ? (
                      <p className={styles.productDesc}>
                        {product.description}
                      </p>
                    ) : null}
                    <p className={styles.productPrice}>
                      {formatPeso(product.price)}
                      {onSale ? (
                        <span className={styles.compareAt}>
                          {formatPeso(product.compareAtPrice ?? 0)}
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={
                        outOfStock ? styles.stockOut : styles.productStock
                      }
                    >
                      {outOfStock
                        ? "Out of stock"
                        : `${product.stock} in stock`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Axis selectors for the chosen product */}
          {builderAxes(step, selection?.product).length > 0 ? (
            <div className={styles.optionsCard}>
              <h2 className={styles.optionsTitle}>Customize this part</h2>
              <div className={styles.axisGrid}>
                {builderAxes(step, selection?.product).map((axis, axisIndex) => {
                  const current = selection?.axisValues[axis.label] ?? "";
                  return (
                    <label key={axis.label} className={styles.axisField}>
                      <span className={styles.axisLabel}>{axis.label}</span>
                      <select
                        className={styles.axisSelect}
                        value={current}
                        aria-label={step.name + " " + axis.label}
                        disabled={!selection || axis.options.length === 0}
                        onChange={(event) =>
                          changeAxis(
                            step.stepNumber,
                            axis.label,
                            event.target.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Choose {axis.label.toLowerCase()}
                        </option>
                        {axis.options.map((option) => (
                          <option key={option} value={option} disabled={Boolean(selection?.product.variants?.length) && !selection?.product.variants?.some((row) => row.available && row.stock > 0 && legacyOptions(row)[axis.label] === option && builderAxes(step, selection.product).slice(0, axisIndex).every((a) => legacyOptions(row)[a.label] === selection.axisValues[a.label]))}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Nav */}
          <div className={styles.stepNav}>
            <button
              type="button"
              className={styles.backBtn}
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((i) => i - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.nextBtn}
              onClick={handleNext}
              disabled={!canContinue}
            >
              {isLast ? "Review build" : "Next"}
              <svg
                className={styles.nextArrow}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M4 12 H19 M13 6 L19 12 L13 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---- Review --------------------------------------------------------------
  const total = orderedSteps.reduce((sum, step) => {
    const s = selections[step.stepNumber];
    return sum + (s ? s.product.price : 0);
  }, 0);

  const orderedSelections = orderedSteps
    .map((step) => ({
      step,
      selection: selections[step.stepNumber],
    }))
    .filter((entry) => entry.selection);

  const buildComplete = orderedSteps.every((step) =>
    hasChosenOptions(step, selections[step.stepNumber]),
  );

  const getBuildItems = (): AddToCartInput[] => {
    const result: AddToCartInput[] = [];
    for (const entry of orderedSelections) {
      const { step, selection } = entry;
      const axisEntries = Object.entries(selection!.axisValues);
      // The selected options travel on the existing size/color cart fields so
      // they display in the cart and persist onto the order line.
      const sizeText = axisEntries
        .map(([label, value]) => `${label}: ${value}`)
        .join(" · ");
      const colorText =
        axisEntries.find(([label]) =>
          /colour|color|finish/i.test(label),
        )?.[1] ??
        axisEntries[0]?.[1] ??
        "Custom";

      result.push({
        productId: selection!.product.id,
        slug: selection!.product.slug,
        options: selection!.axisValues,
        builderStepNumber: step.stepNumber,
        variantId: builderVariant(selection!.product, selection!.axisValues)
          ?.id,
        name: `${step.name} — ${selection!.product.name}`,
        price: selection!.product.price,
        image: selection!.product.image ?? PRODUCT_PLACEHOLDER_SRC,
        size: sizeText || "Standard",
        color: colorText,
        quantity: 1,
        // Carry the real stock so the cart/order line reflects the product's
        // actual availability from the Admin catalog (0 means "no cap" for
        // legacy behavior, but the real value is used when available).
        stock: selection!.product.stock,
      });
    }
    return result;
  };

  const handleAddToCart = () => {
    if (!buildComplete || added) return;
    for (const item of getBuildItems()) addItem(item);
    setAdded(true);
  };
  const handleBuyNow = () => {
    if (!buildComplete) return;
    try { saveDirectCheckout(getBuildItems()); router.push("/checkout/buy-now"); }
    catch (error) { setCheckoutError(error instanceof Error ? error.message : "Checkout could not be opened."); }
  };

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.title}>
          {aiGenerated ? "Your AI-assisted build" : "Your custom build"}
        </h1>
        <p className={styles.lead}>
          Review every part below. You can go back to any step to make changes
          before buying or adding your build to the cart.
        </p>

        {aiGenerated ? (
          <section
            className={styles.optionsCard}
            aria-label="AI recommendation"
          >
            <h2 className={styles.optionsTitle}>
              Suggested parts for your request
            </h2>
            {aiExplanation ? (
              <p className={styles.aiDesc}>{aiExplanation}</p>
            ) : null}
            <p className={styles.aiDesc}>{aiNotice}</p>
            <p className={styles.aiDesc}>
              Confirm the options below before buying or adding your build to the cart.
            </p>
          </section>
        ) : null}

        <button
          type="button"
          className={styles.editBtn}
          onClick={() => {
            setAdded(false);
            setCurrentStep(0);
            setView("builder");
          }}
        >
          Edit parts
        </button>

        <ul className={styles.reviewList}>
          {orderedSelections.map(({ step, selection }) => {
            const axisText = Object.entries(selection!.axisValues)
              .map(([label, value]) => `${label}: ${value}`)
              .join(" · ");
            return (
              <li className={styles.reviewItem} key={step.stepNumber}>
                <span className={styles.reviewBadge} aria-hidden="true">
                  {step.stepNumber}
                </span>
                <div className={styles.reviewBody}>
                  <button type="button" className={styles.changePart} onClick={() => { setCurrentStep(orderedSteps.findIndex((item) => item.stepNumber === step.stepNumber)); setAdded(false); setView("builder"); }}>Change part</button>
                  <p className={styles.reviewName}>
                    {step.name}
                    <span className={styles.reviewProduct}>
                      {selection!.product.name}
                    </span>
                  </p>
                  {axisText ? (
                    <p className={styles.reviewAxes}>{axisText}</p>
                  ) : null}
                  {selection!.reason ? (
                    <p className={styles.reviewReason}>{selection!.reason}</p>
                  ) : null}
                  {aiGenerated &&
                  builderAxes(step, selection?.product).some(
                    (axis) => axis.options.length > 0,
                  ) ? (
                    <div className={styles.reviewOptions}>
                      {builderAxes(step, selection?.product)
                        .filter((axis) => axis.options.length > 0)
                        .map((axis, axisIndex) => (
                          <label
                            key={axis.label}
                            className={styles.reviewOption}
                          >
                            <span className={styles.axisLabel}>
                              {axis.label}
                            </span>
                            <select
                              className={styles.axisSelect}
                              value={selection!.axisValues[axis.label] ?? ""}
                              aria-label={step.name + " " + axis.label}
                              onChange={(event) =>
                                changeAxis(
                                  step.stepNumber,
                                  axis.label,
                                  event.target.value,
                                )
                              }
                            >
                              <option value="" disabled>
                                Choose {axis.label.toLowerCase()}
                              </option>
                              {axis.options.map((option) => (
                                <option key={option} value={option} disabled={Boolean(selection?.product.variants?.length) && !selection?.product.variants?.some((row) => row.available && row.stock > 0 && legacyOptions(row)[axis.label] === option && builderAxes(step, selection.product).slice(0, axisIndex).every((a) => legacyOptions(row)[a.label] === selection.axisValues[a.label]))}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                    </div>
                  ) : null}
                </div>
                <p className={styles.reviewPrice}>
                  {formatPeso(selection!.product.price)}
                </p>
              </li>
            );
          })}
        </ul>

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Build total</span>
          <span className={styles.totalValue}>{formatPeso(total)}</span>
        </div>

        <p className={styles.note}>
          {aiGenerated
            ? "AI suggested the starting parts. Your edits are included in the total. Shipping is calculated at checkout."
            : "Shipping is calculated at checkout. You can change any part below before adding to cart."}
        </p>
        {!buildComplete ? (
          <p className={styles.note} role="status">
            Choose the sizes, colours, and other available options above to
            complete your build.
          </p>
        ) : null}

        <div className={styles.reviewActions}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => {
              if (aiGenerated) {
                setAiError(null);
                setView("landing");
              } else {
                setCurrentStep(orderedSteps.length - 1);
                setView("builder");
              }
            }}
          >
            {aiGenerated ? "Change request" : "Back"}
          </button>
          <div className={styles.purchaseActions}>
            <button type="button" className={styles.cartSquare} onClick={handleAddToCart} disabled={added || !buildComplete} aria-label={added ? "Build added to cart" : "Add build to cart"} title={added ? "Added to cart" : "Add to cart"}>
              {added ? <span aria-hidden="true">✓</span> : <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h11l2-8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M15 2v6m-3-3h6"/></svg>}
            </button>
            <button type="button" className={styles.addToCart} onClick={handleBuyNow} disabled={!buildComplete}>Buy Now</button>
          </div>
        </div>
        {checkoutError ? <p role="alert">{checkoutError}</p> : null}
      </div>
    </main>
  );
}
