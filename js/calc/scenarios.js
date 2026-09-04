/**
 * FULCRUM — scenarios.js
 * Turns a set of user-defined scenarios (each with its own assumptions and
 * a probability weight) into: a single-point valuation per scenario, a
 * probability-weighted fair value, a median across the FULL simulated
 * outcome set (every scenario's sensitivity grid, flattened together —
 * not just the 3-point average), and football-field ranges for charting.
 */
(function (root, factory) {
  const DCF = typeof module !== 'undefined' && module.exports ? require('./dcf.js') : root.Fulcrum.DCF;
  const Sensitivity = typeof module !== 'undefined' && module.exports ? require('./sensitivity.js') : root.Fulcrum.Sensitivity;
  const Utils = typeof module !== 'undefined' && module.exports ? require('./finance-utils.js') : root.Fulcrum.Utils;
  const mod = factory(DCF, Sensitivity, Utils);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.Scenarios = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (DCF, Sensitivity, Utils) {

  /** Validate that scenario probabilities sum to ~1 (within floating point tolerance). */
  function validateWeights(scenarios) {
    const total = Utils.sum(scenarios.map((s) => s.probability));
    return { total, valid: Math.abs(total - 1) < 0.005 };
  }

  /**
   * Run every scenario's point valuation (FCFF or FCFE per scenario's own valuationMode),
   * plus — if a sensitivityConfig is supplied — that scenario's own sensitivity grid,
   * to get a min/max range for the football field.
   *
   * scenarios: [{ id, name, color, probability, valuationMode, assumptions, wacc, costOfEquity }]
   * shared: { bridge, sharesOutstanding, midYear, sensitivityConfig?: { xVar, xRange, yVar, yRange } }
   */
  function runAll(scenarios, shared) {
    const results = scenarios.map((s) => {
      const point = s.valuationMode === 'FCFE'
        ? DCF.runFCFEValuation(s.assumptions, s.costOfEquity, shared.sharesOutstanding, shared.midYear)
        : DCF.runFCFFValuation(s.assumptions, s.wacc, shared.bridge, shared.sharesOutstanding, shared.midYear);

      let gridResult = null;
      let range = { min: point.pricePerShare, max: point.pricePerShare };
      if (shared.sensitivityConfig) {
        const base = {
          assumptions: s.assumptions, wacc: s.wacc, costOfEquity: s.costOfEquity,
          bridge: shared.bridge, sharesOutstanding: shared.sharesOutstanding,
          midYear: shared.midYear, valuationMode: s.valuationMode
        };
        gridResult = Sensitivity.buildGrid(
          base,
          shared.sensitivityConfig.xVar, shared.sensitivityConfig.xRange,
          shared.sensitivityConfig.yVar, shared.sensitivityConfig.yRange
        );
        const flat = Sensitivity.flattenGrid(gridResult).filter(Number.isFinite);
        if (flat.length) range = { min: Math.min(...flat), max: Math.max(...flat) };
      }

      return { ...s, point, gridResult, range };
    });

    const weightCheck = validateWeights(scenarios);
    const weightedFairValue = Utils.weightedAverage(
      results.map((r) => r.point.pricePerShare),
      results.map((r) => r.probability)
    );

    // Full simulated distribution: every scenario's grid outcomes flattened together.
    // Falls back to the set of point estimates if no sensitivity grids were run.
    let distribution = [];
    results.forEach((r) => {
      if (r.gridResult) distribution = distribution.concat(Sensitivity.flattenGrid(r.gridResult));
      else distribution.push(r.point.pricePerShare);
    });

    const medianFairValue = Utils.median(distribution);
    const dispersion = Utils.stdev(distribution);

    return { results, weightCheck, weightedFairValue, medianFairValue, dispersion, distribution };
  }

  return { validateWeights, runAll };
});
