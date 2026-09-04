/**
 * FULCRUM — finance-utils.js
 * Pure helper functions used across the calculation engine.
 * No DOM access. No external calls. Deterministic in, deterministic out.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.Utils = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /** Clamp a number between min and max. */
  function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
  }

  /**
   * Build a fade path of N annual values moving from startVal to endVal.
   * curve: 'linear' | 'frontloaded' | 'backloaded'
   * Returns an array of length years.
   */
  function fadePath(startVal, endVal, years, curve) {
    curve = curve || 'linear';
    const out = [];
    for (let i = 0; i < years; i++) {
      const t = years === 1 ? 1 : i / (years - 1); // 0 -> 1
      let w = t;
      if (curve === 'frontloaded') w = Math.sqrt(t);      // reaches endVal faster
      if (curve === 'backloaded') w = t * t;               // stays near startVal longer
      out.push(startVal + (endVal - startVal) * w);
    }
    return out;
  }

  /** Sum of an array, ignoring undefined/null. */
  function sum(arr) {
    return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  }

  /** Arithmetic mean. */
  function mean(arr) {
    const clean = arr.filter(Number.isFinite);
    if (!clean.length) return NaN;
    return sum(clean) / clean.length;
  }

  /** Median — sorts a copy, does not mutate input. */
  function median(arr) {
    const clean = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!clean.length) return NaN;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 !== 0 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  }

  /** Weighted average given parallel arrays of values and weights. Weights need not sum to 1 (normalized here). */
  function weightedAverage(values, weights) {
    const totalW = sum(weights);
    if (totalW === 0) return NaN;
    let acc = 0;
    for (let i = 0; i < values.length; i++) {
      acc += (values[i] || 0) * (weights[i] || 0);
    }
    return acc / totalW;
  }

  /**
   * Present value of a single cashflow.
   * period: 1-indexed year number (1 = end of year 1)
   * midYear: if true, discounts at (period - 0.5) — Damodaran's mid-year convention,
   * which assumes cash arrives evenly through the year rather than at year-end.
   */
  function presentValue(cashflow, rate, period, midYear) {
    const t = midYear ? period - 0.5 : period;
    return cashflow / Math.pow(1 + rate, t);
  }

  /** Present value of an array of cashflows for years 1..N. */
  function presentValueSeries(cashflows, rate, midYear) {
    return cashflows.reduce((acc, cf, idx) => acc + presentValue(cf, rate, idx + 1, midYear), 0);
  }

  /** Standard deviation (population) — used for sanity-checking dispersion of scenario outcomes. */
  function stdev(arr) {
    const clean = arr.filter(Number.isFinite);
    if (clean.length < 2) return 0;
    const m = mean(clean);
    const variance = sum(clean.map((x) => (x - m) ** 2)) / clean.length;
    return Math.sqrt(variance);
  }

  /** Simple linear range generator: min, max, step (inclusive of max if it lands exactly, else stops before). */
  function range(min, max, step) {
    const out = [];
    if (step <= 0) return [min];
    for (let v = min; v <= max + 1e-9; v += step) {
      out.push(Math.round(v * 1e6) / 1e6); // guard against float drift
    }
    return out;
  }

  return {
    clamp, fadePath, sum, mean, median, weightedAverage,
    presentValue, presentValueSeries, stdev, range
  };
});
