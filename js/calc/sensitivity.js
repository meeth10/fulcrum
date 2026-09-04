/**
 * FULCRUM — sensitivity.js
 * Generates the 2-variable sensitivity grid ("the gimbal") by re-running
 * the DCF engine at each combination of two chosen variables, and produces
 * the flattened outcome set used for the median/football-field view.
 *
 * Supported grid variables: 'wacc', 'terminalGrowth', 'revenueGrowth', 'exitMultiple', 'ebitMargin'
 * 'revenueGrowth' / 'ebitMargin' perturb the END value of that variable's fade path
 * (i.e. the steady-state assumption), holding the start value fixed — this mirrors
 * how analysts usually stress-test a DCF: the near-term view is more certain,
 * the terminal/steady-state view is where disagreement lives.
 */
(function (root, factory) {
  const DCF = typeof module !== 'undefined' && module.exports
    ? require('./dcf.js')
    : root.Fulcrum.DCF;
  const Utils = typeof module !== 'undefined' && module.exports
    ? require('./finance-utils.js')
    : root.Fulcrum.Utils;
  const mod = factory(DCF, Utils);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.Sensitivity = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (DCF, Utils) {

  /** Apply a {variable, value} perturbation onto a cloned assumptions/context bundle.
   *  Preserves every other field of `base` (bridge, sharesOutstanding, midYear, valuationMode, etc.)
   *  so this can be chained or applied ahead of buildGrid without losing context. */
  function applyVariable(base, variable, value) {
    const a = JSON.parse(JSON.stringify(base.assumptions));
    let wacc = base.wacc;
    let costOfEquity = base.costOfEquity;

    switch (variable) {
      case 'wacc':
        wacc = value;
        break;
      case 'costOfEquity':
        costOfEquity = value;
        break;
      case 'terminalGrowth':
        a.terminalGrowthRate = value;
        break;
      case 'revenueGrowth':
        a.revenueGrowthEnd = value;
        a.revenueGrowthPath = null; // force re-fade with new endpoint
        break;
      case 'ebitMargin':
        a.ebitMarginEnd = value;
        a.ebitMarginPath = null;
        break;
      case 'exitMultiple':
        a.exitMultiple = value;
        break;
      default:
        break;
    }
    return { ...base, assumptions: a, wacc, costOfEquity };
  }

  /**
   * Build the 2D grid. `base` = { assumptions, wacc, costOfEquity, bridge, sharesOutstanding, midYear, valuationMode }
   * valuationMode: 'FCFF' | 'FCFE'
   * xVar/yVar: one of the supported variable keys above; xRange/yRange: arrays of values (use Utils.range()).
   * Returns { xRange, yRange, grid } where grid[row][col] = price per share, row indexed by yRange, col by xRange.
   */
  function buildGrid(base, xVar, xRange, yVar, yRange) {
    const grid = yRange.map((yVal) => xRange.map((xVal) => {
      // Chain both perturbations through the same context — applyVariable preserves
      // wacc/costOfEquity untouched unless that specific variable is the one being set.
      let ctx = applyVariable(base, xVar, xVal);
      ctx = applyVariable(ctx, yVar, yVal);

      if (base.valuationMode === 'FCFE') {
        const r = DCF.runFCFEValuation(ctx.assumptions, ctx.costOfEquity, base.sharesOutstanding, base.midYear);
        return r.pricePerShare;
      }
      const r = DCF.runFCFFValuation(ctx.assumptions, ctx.wacc, base.bridge, base.sharesOutstanding, base.midYear);
      return r.pricePerShare;
    }));
    return { xVar, yVar, xRange, yRange, grid };
  }

  /** Flatten a grid to a 1D array of finite prices, for distribution stats (median, stdev). */
  function flattenGrid(gridResult) {
    const out = [];
    gridResult.grid.forEach((row) => row.forEach((v) => { if (Number.isFinite(v)) out.push(v); }));
    return out;
  }

  return { applyVariable, buildGrid, flattenGrid };
});
