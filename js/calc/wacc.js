/**
 * FULCRUM — wacc.js
 * Cost of capital: CAPM cost of equity, Damodaran-style bottom-up beta,
 * synthetic-rating cost of debt, and the WACC blend.
 *
 * IMPORTANT: the default spread table in SYNTHETIC_SPREAD_TABLE is an
 * ILLUSTRATIVE starting point based on the general shape of Damodaran's
 * published interest-coverage-to-rating tables. It is NOT live market data.
 * Replace it with current figures from Damodaran's NYU Stern site
 * (pages.stern.nyu.edu/~adamodar) before relying on this for real work.
 * FULCRUM never fetches this automatically — that would be exactly the
 * kind of silent AI-sourced number the brief asked to avoid.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.WACC = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /** Unlever a levered (equity) beta to a business-risk-only beta.
   *  βu = βL / (1 + (1 - t) * D/E) */
  function unleverBeta(leveredBeta, taxRate, deRatio) {
    return leveredBeta / (1 + (1 - taxRate) * deRatio);
  }

  /** Relever an unlevered beta at a target D/E and tax rate.
   *  βL = βu * (1 + (1 - t) * D/E) */
  function releverBeta(unleveredBeta, taxRate, deRatio) {
    return unleveredBeta * (1 + (1 - taxRate) * deRatio);
  }

  /**
   * Bottom-up beta à la Damodaran: unlever each comp's beta at ITS OWN
   * capital structure and tax rate, average the unlevered betas, then
   * relever once at the SUBJECT company's target structure.
   * comps: [{ beta, de, taxRate }]
   */
  function bottomUpBeta(comps, targetDE, targetTaxRate) {
    const unlevered = comps
      .filter((c) => Number.isFinite(c.beta) && Number.isFinite(c.de))
      .map((c) => unleverBeta(c.beta, c.taxRate, c.de));
    if (!unlevered.length) return { unleveredAverage: NaN, relevered: NaN, count: 0 };
    const avg = unlevered.reduce((a, b) => a + b, 0) / unlevered.length;
    return {
      unleveredAverage: avg,
      relevered: releverBeta(avg, targetTaxRate, targetDE),
      count: unlevered.length
    };
  }

  /**
   * Cost of equity via CAPM, with optional additive premia — Damodaran
   * routinely layers a size premium and/or country risk premium onto
   * base CAPM for smaller or emerging-market names.
   */
  function costOfEquityCAPM({ riskFreeRate, beta, equityRiskPremium, sizePremium = 0, countryRiskPremium = 0 }) {
    return riskFreeRate + beta * equityRiskPremium + sizePremium + countryRiskPremium;
  }

  // Illustrative interest-coverage -> synthetic rating -> default spread bands.
  // Structure mirrors Damodaran's published tables; VALUES ARE PLACEHOLDERS.
  const SYNTHETIC_SPREAD_TABLE = [
    { min: 8.5, max: Infinity, rating: 'AAA', spread: 0.0069 },
    { min: 6.5, max: 8.5, rating: 'AA', spread: 0.0085 },
    { min: 5.5, max: 6.5, rating: 'A+', spread: 0.0100 },
    { min: 4.25, max: 5.5, rating: 'A', spread: 0.0115 },
    { min: 3.0, max: 4.25, rating: 'A-', spread: 0.0130 },
    { min: 2.5, max: 3.0, rating: 'BBB', spread: 0.0190 },
    { min: 2.25, max: 2.5, rating: 'BB+', spread: 0.0245 },
    { min: 2.0, max: 2.25, rating: 'BB', spread: 0.0300 },
    { min: 1.75, max: 2.0, rating: 'B+', spread: 0.0400 },
    { min: 1.5, max: 1.75, rating: 'B', spread: 0.0500 },
    { min: 1.25, max: 1.5, rating: 'B-', spread: 0.0620 },
    { min: 0.8, max: 1.25, rating: 'CCC', spread: 0.0800 },
    { min: 0.5, max: 0.8, rating: 'CC', spread: 0.1000 },
    { min: -Infinity, max: 0.5, rating: 'D', spread: 0.1250 }
  ];

  function syntheticRatingSpread(interestCoverageRatio, table) {
    const t = table && table.length ? table : SYNTHETIC_SPREAD_TABLE;
    const band = t.find((b) => interestCoverageRatio > b.min && interestCoverageRatio <= b.max)
      || t[t.length - 1];
    return { rating: band.rating, spread: band.spread };
  }

  /**
   * Pre-tax cost of debt, either directly supplied or derived synthetically
   * from an interest coverage ratio (EBIT / Interest Expense) via the spread table.
   */
  function costOfDebt({ method, directRatePretax, riskFreeRate, interestCoverageRatio, spreadTable }) {
    if (method === 'direct') {
      return { pretax: directRatePretax, rating: null, spread: null };
    }
    const { rating, spread } = syntheticRatingSpread(interestCoverageRatio, spreadTable);
    return { pretax: riskFreeRate + spread, rating, spread };
  }

  /**
   * WACC = (E/V)*Re + (D/V)*Rd*(1-t)
   * marketValueEquity / marketValueDebt should be MARKET values, not book —
   * Damodaran is emphatic on this point for equity; book is an acceptable
   * proxy for debt when market debt values aren't available.
   */
  function wacc({ costOfEquity, costOfDebtPretax, taxRate, marketValueEquity, marketValueDebt }) {
    const V = marketValueEquity + marketValueDebt;
    if (V <= 0) return NaN;
    const we = marketValueEquity / V;
    const wd = marketValueDebt / V;
    const afterTaxKd = costOfDebtPretax * (1 - taxRate);
    return we * costOfEquity + wd * afterTaxKd;
  }

  return {
    unleverBeta, releverBeta, bottomUpBeta, costOfEquityCAPM,
    SYNTHETIC_SPREAD_TABLE, syntheticRatingSpread, costOfDebt, wacc
  };
});
