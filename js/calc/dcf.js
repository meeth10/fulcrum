/**
 * FULCRUM — dcf.js
 * Two-stage DCF engine. Projects FCFF and FCFE off explicit-period
 * assumptions, builds a terminal value (Gordon Growth or Exit Multiple),
 * discounts everything back, and bridges Firm Value <-> Equity Value.
 *
 * Depends on: finance-utils.js (Utils.fadePath, Utils.presentValueSeries, Utils.presentValue)
 */
(function (root, factory) {
  const Utils = typeof module !== 'undefined' && module.exports
    ? require('./finance-utils.js')
    : root.Fulcrum.Utils;
  const mod = factory(Utils);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.DCF = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (Utils) {

  /**
   * Build the explicit-period operating projection.
   *
   * assumptions:
   *   baseRevenue          — trailing twelve month / last actual revenue
   *   forecastYears         — N
   *   revenueGrowthPath     — either an array of length N (manual override), OR
   *   revenueGrowthStart/End + growthCurve — used to build a fade path if no array given
   *   ebitMarginPath        — array length N, OR ebitMarginStart/End + marginCurve
   *   taxRate               — flat effective/marginal tax rate applied to EBIT
   *   daPctRevenuePath      — D&A as % of revenue, array or start/end
   *   capexPctRevenuePath   — CapEx as % of revenue, array or start/end
   *   nwcPctRevenueChangePath — incremental NWC as % of the REVENUE CHANGE that year
   *
   * Returns per-year arrays: revenue, ebit, nopat, da, capex, deltaNWC, fcff
   */
  function resolvePath(explicitArray, startVal, endVal, years, curve) {
    if (Array.isArray(explicitArray) && explicitArray.length === years) return explicitArray;
    return Utils.fadePath(startVal, endVal, years, curve);
  }

  function projectOperating(a) {
    const N = a.forecastYears;
    const growth = resolvePath(a.revenueGrowthPath, a.revenueGrowthStart, a.revenueGrowthEnd, N, a.growthCurve);
    const margin = resolvePath(a.ebitMarginPath, a.ebitMarginStart, a.ebitMarginEnd, N, a.marginCurve);
    const daPct = resolvePath(a.daPctRevenuePath, a.daPctRevenueStart, a.daPctRevenueEnd, N, 'linear');
    const capexPct = resolvePath(a.capexPctRevenuePath, a.capexPctRevenueStart, a.capexPctRevenueEnd, N, 'linear');
    const nwcPct = resolvePath(a.nwcPctRevenueChangePath, a.nwcPctRevenueChangeStart, a.nwcPctRevenueChangeEnd, N, 'linear');

    const revenue = [];
    const ebit = [];
    const nopat = [];
    const da = [];
    const capex = [];
    const deltaNWC = [];
    const fcff = [];

    let prevRevenue = a.baseRevenue;
    for (let i = 0; i < N; i++) {
      const rev = prevRevenue * (1 + growth[i]);
      const ebitY = rev * margin[i];
      const nopatY = ebitY * (1 - a.taxRate);
      const daY = rev * daPct[i];
      const capexY = rev * capexPct[i];
      const revChange = rev - prevRevenue;
      const nwcY = revChange * nwcPct[i];
      const fcffY = nopatY + daY - capexY - nwcY;

      revenue.push(rev);
      ebit.push(ebitY);
      nopat.push(nopatY);
      da.push(daY);
      capex.push(capexY);
      deltaNWC.push(nwcY);
      fcff.push(fcffY);

      prevRevenue = rev;
    }

    return { years: N, revenue, ebit, nopat, da, capex, deltaNWC, fcff, growth, margin };
  }

  /** FCFE from FCFF: FCFE = FCFF - Interest*(1-t) + Net Borrowing
   *  (equivalently, built straight from net income — both should reconcile) */
  function fcffToFcfe(fcffArray, interestExpenseArray, taxRate, netBorrowingArray) {
    return fcffArray.map((fcffY, i) => {
      const afterTaxInterest = (interestExpenseArray[i] || 0) * (1 - taxRate);
      const netBorrow = netBorrowingArray[i] || 0;
      return fcffY - afterTaxInterest + netBorrow;
    });
  }

  /** Gordon Growth terminal value, evaluated on the FINAL explicit-period cashflow. */
  function terminalValueGordon(finalCashflow, discountRate, terminalGrowth) {
    if (discountRate <= terminalGrowth) return Infinity; // mathematically undefined / explosive — flagged upstream
    return (finalCashflow * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  }

  /** Exit-multiple terminal value off a terminal-year metric (EBITDA or EBIT typically). */
  function terminalValueExitMultiple(terminalMetricValue, multiple) {
    return terminalMetricValue * multiple;
  }

  /**
   * Full discount: explicit-period cashflows + terminal value (attached to
   * the final forecast year) back to present, at `rate`.
   */
  function discountToPresent(cashflows, terminalValue, rate, midYear) {
    const N = cashflows.length;
    const pvExplicit = Utils.presentValueSeries(cashflows, rate, midYear);
    const pvTerminal = Utils.presentValue(terminalValue, rate, N, midYear);
    return { pvExplicit, pvTerminal, total: pvExplicit + pvTerminal };
  }

  /**
   * Firm-value route: project FCFF, discount at WACC, bridge to equity value and per-share price.
   * bridge: { totalDebt, minorityInterest, preferredStock, cashAndEquivalents, nonOperatingAssets = 0 }
   */
  function runFCFFValuation(assumptions, wacc, bridge, sharesOutstanding, midYear) {
    const proj = projectOperating(assumptions);
    const finalEBITDA = proj.ebit[proj.years - 1] + proj.da[proj.years - 1];
    const terminalMetric = assumptions.exitMultipleMetric === 'EBIT'
      ? proj.ebit[proj.years - 1]
      : finalEBITDA;

    const tv = assumptions.terminalMethod === 'exitMultiple'
      ? terminalValueExitMultiple(terminalMetric, assumptions.exitMultiple)
      : terminalValueGordon(proj.fcff[proj.years - 1], wacc, assumptions.terminalGrowthRate);

    const disc = discountToPresent(proj.fcff, tv, wacc, midYear);
    const firmValue = disc.total;
    const equityValue = firmValue
      - (bridge.totalDebt || 0)
      - (bridge.minorityInterest || 0)
      - (bridge.preferredStock || 0)
      + (bridge.cashAndEquivalents || 0)
      + (bridge.nonOperatingAssets || 0);
    const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : NaN;

    return { proj, terminalValue: tv, ...disc, firmValue, equityValue, pricePerShare, wacc };
  }

  /**
   * Equity-value route: project FCFE, discount at cost of equity directly.
   * netBorrowingPath / interestExpensePath: arrays length = forecastYears (can be zeros).
   */
  function runFCFEValuation(assumptions, costOfEquity, sharesOutstanding, midYear) {
    const proj = projectOperating(assumptions);
    const interestPath = assumptions.interestExpensePath || proj.revenue.map(() => 0);
    const borrowPath = assumptions.netBorrowingPath || proj.revenue.map(() => 0);
    const fcfe = fcffToFcfe(proj.fcff, interestPath, assumptions.taxRate, borrowPath);

    const finalEBITDA = proj.ebit[proj.years - 1] + proj.da[proj.years - 1];
    const terminalMetric = assumptions.exitMultipleMetric === 'EBIT'
      ? proj.ebit[proj.years - 1]
      : finalEBITDA;

    const tv = assumptions.terminalMethod === 'exitMultiple'
      ? terminalValueExitMultiple(terminalMetric, assumptions.exitMultiple)
      : terminalValueGordon(fcfe[fcfe.length - 1], costOfEquity, assumptions.terminalGrowthRate);

    const disc = discountToPresent(fcfe, tv, costOfEquity, midYear);
    const equityValue = disc.total;
    const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : NaN;

    return { proj, fcfe, terminalValue: tv, ...disc, equityValue, pricePerShare, costOfEquity };
  }

  /** QC check: how far apart are the two independent routes to equity value? */
  function reconcile(fcffEquityValue, fcfeEquityValue) {
    if (!Number.isFinite(fcffEquityValue) || !Number.isFinite(fcfeEquityValue) || fcffEquityValue === 0) {
      return { pctDifference: NaN, flag: true };
    }
    const pctDifference = (fcfeEquityValue - fcffEquityValue) / Math.abs(fcffEquityValue);
    return { pctDifference, flag: Math.abs(pctDifference) > 0.15 };
  }

  return {
    projectOperating, fcffToFcfe, terminalValueGordon, terminalValueExitMultiple,
    discountToPresent, runFCFFValuation, runFCFEValuation, reconcile
  };
});
