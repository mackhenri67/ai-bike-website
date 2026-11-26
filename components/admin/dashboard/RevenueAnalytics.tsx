"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RevenueAnalytics.module.css";
import { ChevronDownIcon, DownloadIcon, EyeIcon, PrintIcon } from "./icons";

type PeriodId = "7d" | "30d" | "6m" | "12m";
type MetricId =
  | "totalSales"
  | "productSales"
  | "ticketSales"
  | "customBuildSales"
  | "laborRevenue";

type Period = { id: PeriodId; label: string };
type Metric = { id: MetricId; label: string };

const PERIODS: Period[] = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "6m", label: "Last 6 Months" },
  { id: "12m", label: "Last 12 Months" },
];

const METRICS: Metric[] = [
  { id: "totalSales", label: "Total Sales" },
  { id: "productSales", label: "Product Sales" },
  { id: "ticketSales", label: "Ticket Sales" },
  { id: "customBuildSales", label: "Custom Build Sales" },
  { id: "laborRevenue", label: "Labor Revenue" },
];

export type RevenuePoint = {
  label: string;
  value: number;
  totalSales: number;
  productSales: number;
  ticketSales: number;
  customBuildSales: number;
  laborRevenue: number;
};

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

/** Compact axis label, e.g. ₱5k, ₱1.25M. */
function formatCompactPeso(value: number): string {
  if (value >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `₱${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `₱${value}`;
}

type RevenueAnalyticsProps = {
  dailyData: RevenuePoint[];
  weeklyData: RevenuePoint[];
  monthlyData: RevenuePoint[];
  error?: string | null;
};

export default function RevenueAnalytics({
  dailyData,
  weeklyData,
  monthlyData,
  error: initialError,
}: RevenueAnalyticsProps) {
  const [period, setPeriod] = useState<Period>(PERIODS[0]);
  const [metric, setMetric] = useState<Metric>(METRICS[0]);
  const [openDropdown, setOpenDropdown] = useState<"period" | "metric" | null>(null);
  const [showValues, setShowValues] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const metricDropdownRef = useRef<HTMLDivElement>(null);
  const periodDropdownRef = useRef<HTMLDivElement>(null);

  const periodData =
    period.id === "7d"
      ? dailyData
      : period.id === "30d"
        ? weeklyData
        : monthlyData;
  const data = periodData.map((point) => ({
    label: point.label,
    value: point[metric.id],
  }));

  // Chart scale is derived from the selected real-data series.
  const rawMax = data.reduce((max, point) => Math.max(max, point.value), 0);
  const yMax = Math.max(1000, Math.ceil(rawMax / 1000) * 1000);
  const ySteps = Array.from({ length: 10 }, (_, index) => (10 - index) / 10);
  const barWidth = (100 / Math.max(data.length, 1)) * 0.8;

  // Close either dropdown on outside click or Escape.
  useEffect(() => {
    if (!openDropdown) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !metricDropdownRef.current?.contains(target) &&
        !periodDropdownRef.current?.contains(target)
      ) {
        setOpenDropdown(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDropdown(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openDropdown]);

  const selectPeriod = (next: Period) => {
    setPeriod(next);
    setOpenDropdown(null);
  };

  const selectMetric = (next: Metric) => {
    setMetric(next);
    setOpenDropdown(null);
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch(
        `/api/admin/dashboard/revenue-export?period=${period.id}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "The detailed sales export could not be generated.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1]
        ?? `detailed-sales-${period.id}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The detailed sales export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const error = initialError ?? null;

  return (
    <section className={styles.analytics} aria-label="Revenue analytics">
      <header className={styles.header}>
        <h2 className={styles.title}>Revenue Analytics</h2>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.printButton}
            onClick={() => window.print()}
            aria-label="Print report"
            title="Print report"
          >
            <PrintIcon size={18} />
          </button>

          <div className={styles.dropdown} ref={metricDropdownRef}>
            <button
              type="button"
              className={`${styles.dropdownTrigger} ${styles.metricTrigger}`}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "metric" ? null : "metric",
                )
              }
              aria-haspopup="menu"
              aria-expanded={openDropdown === "metric"}
              aria-label="Select sales metric"
            >
              <span>{metric.label}</span>
              <ChevronDownIcon
                size={16}
                className={`${styles.chevron} ${openDropdown === "metric" ? styles.chevronOpen : ""}`}
              />
            </button>
            {openDropdown === "metric" ? (
              <div className={styles.menu} role="menu">
                {METRICS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === metric.id}
                    className={`${styles.option} ${option.id === metric.id ? styles.optionActive : ""}`}
                    onClick={() => selectMetric(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.dropdown} ref={periodDropdownRef}>
            <button
              type="button"
              className={styles.dropdownTrigger}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "period" ? null : "period",
                )
              }
              aria-haspopup="menu"
              aria-expanded={openDropdown === "period"}
              aria-label="Select date range"
            >
              <span>{period.label}</span>
              <ChevronDownIcon
                size={16}
                className={`${styles.chevron} ${openDropdown === "period" ? styles.chevronOpen : ""}`}
              />
            </button>
            {openDropdown === "period" ? (
              <div className={styles.menu} role="menu">
                {PERIODS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === period.id}
                    className={`${styles.option} ${option.id === period.id ? styles.optionActive : ""}`}
                    onClick={() => selectPeriod(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.chart}>
        <div className={styles.chartBody}>
          <div className={styles.yAxis}>
            {ySteps.map((fraction, index) => (
              <span
                key={fraction}
                className={styles.yLabel}
                style={{ top: `${index * 10}%` }}
              >
                {formatCompactPeso(yMax * fraction)}
              </span>
            ))}
          </div>

          <div className={styles.chartMain}>
            <div className={styles.plot}>
              {ySteps.map((fraction, index) => (
                <span
                  key={fraction}
                  className={styles.hGrid}
                  style={{ top: `${index * 10}%` }}
                />
              ))}

              <div className={styles.bars}>
                {data.map((point, index) => (
                  <div
                    key={`${point.label}-${index}`}
                    className={styles.barGroup}
                    style={{ width: `${barWidth}%` }}
                  >
                    <span className={styles.vGrid} aria-hidden="true" />
                    <div
                      className={styles.bar}
                      style={{
                        height: `${Math.min(100, (point.value / yMax) * 100)}%`,
                      }}
                    >
                      {showValues ? (
                        <span className={styles.barValue}>
                          {formatPeso(point.value)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.xAxis}>
              {data.map((point, index) => (
                <span
                  key={`${point.label}-${index}`}
                  className={styles.xLabel}
                  style={{ width: `${barWidth}%` }}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <p className={styles.footerText}>
          {exportError ?? error ?? `${metric.label} · ${period.label}`}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.outlineButton}
            onClick={() => setShowValues((value) => !value)}
          >
            <EyeIcon size={16} />
            <span>{showValues ? "Hide Exact Numbers" : "View Exact Numbers"}</span>
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleExport}
            disabled={isExporting}
          >
            <DownloadIcon size={16} />
            <span>{isExporting ? "Preparing CSV..." : "Export to CSV"}</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
