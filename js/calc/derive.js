/**
 * FULCRUM — derive.js
 * Bridges the raw state shape to the pure calc modules (wacc.js, dcf.js).
 * Every UI module that needs "the current WACC" or "the current bridge"
 * should call these instead of re-deriving state shape logic themselves.
 */
(function (root, factory) {
  const WACC = typeof module !== 'undefined' && module.exports ? require('./wacc.js') : root.Fulcrum.WACC;
  const mod = factory(WACC);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.Fulcrum = root.Fulcrum || {};
    root.Fulcrum.Derive = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (WACC) {

  function latest(arr) {
    if (!arr || !arr.length) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Number.isFinite(arr[i])) return arr[i];
    }
    return null;
  }

  /** Cost of equity, cost of debt, and WACC from the current costOfCapital block + latest balance sheet. */
  function costOfCapital(state) {
    const cc = state.costOfCapital;
    const company = state.company;
    const bs = state.statements.balance;

    let beta, betaDetail = null;
    if (cc.betaMode === 'bottomUp') {
      betaDetail = WACC.bottomUpBeta(cc.comps, cc.targetDE, cc.taxRate);
      beta = betaDetail.relevered;
    } else {
      beta = cc.directBeta;
    }

    const costOfEquity = WACC.costOfEquityCAPM({
      riskFreeRate: cc.riskFreeRate, beta,
      equityRiskPremium: cc.equityRiskPremium,
      sizePremium: cc.sizePremium || 0,
      countryRiskPremium: cc.countryRiskPremium || 0
    });

    const debtResult = WACC.costOfDebt({
      method: cc.costOfDebtMethod,
      directRatePretax: cc.directCostOfDebtPretax,
      riskFreeRate: cc.riskFreeRate,
      interestCoverageRatio: cc.interestCoverageRatio
    });

    const latestDebt = (latest(bs.shortTermDebt) || 0) + (latest(bs.longTermDebt) || 0);
    const marketValueEquity = Number.isFinite(cc.marketValueEquity)
      ? cc.marketValueEquity
      : (Number.isFinite(company.currentPrice) && Number.isFinite(company.sharesOutstanding)
          ? company.currentPrice * company.sharesOutstanding : null);
    const marketValueDebt = Number.isFinite(cc.marketValueDebt) ? cc.marketValueDebt : latestDebt;

    let waccValue = null;
    if (Number.isFinite(marketValueEquity) && Number.isFinite(marketValueDebt) && (marketValueEquity + marketValueDebt) > 0) {
      waccValue = WACC.wacc({
        costOfEquity, costOfDebtPretax: debtResult.pretax, taxRate: cc.taxRate,
        marketValueEquity, marketValueDebt
      });
    }

    return {
      beta, betaDetail, costOfEquity,
      costOfDebtPretax: debtResult.pretax, costOfDebtRating: debtResult.rating, costOfDebtSpread: debtResult.spread,
      costOfDebtAfterTax: Number.isFinite(debtResult.pretax) ? debtResult.pretax * (1 - cc.taxRate) : null,
      marketValueEquity, marketValueDebt, wacc: waccValue,
      weightEquity: (Number.isFinite(marketValueEquity) && Number.isFinite(marketValueDebt) && (marketValueEquity + marketValueDebt) > 0)
        ? marketValueEquity / (marketValueEquity + marketValueDebt) : null
    };
  }

  /** Firm-value -> equity-value bridge items, off the latest balance sheet column. */
  function bridge(state) {
    const bs = state.statements.balance;
    return {
      totalDebt: (latest(bs.shortTermDebt) || 0) + (latest(bs.longTermDebt) || 0),
      minorityInterest: latest(bs.minorityInterest) || 0,
      preferredStock: latest(bs.preferredStock) || 0,
      cashAndEquivalents: latest(bs.cash) || 0,
      nonOperatingAssets: 0
    };
  }

  /** Base-year (most recent actual) operating figures, for sanity-checking scenario assumptions against reality. */
  function baseYear(state) {
    const is = state.statements.income;
    const cf = state.statements.cashflow;
    const rev = latest(is.revenue);
    const ebit = latest(is.ebit);
    const interest = latest(is.interestExpense);
    return {
      revenue: rev,
      ebit,
      ebitMargin: (Number.isFinite(rev) && rev !== 0 && Number.isFinite(ebit)) ? ebit / rev : null,
      daPctRevenue: (Number.isFinite(rev) && rev !== 0 && Number.isFinite(latest(cf.da))) ? latest(cf.da) / rev : null,
      capexPctRevenue: (Number.isFinite(rev) && rev !== 0 && Number.isFinite(latest(cf.capex))) ? latest(cf.capex) / rev : null,
      interestExpense: interest,
      taxExpense: latest(is.taxExpense),
      interestCoverage: (Number.isFinite(ebit) && Number.isFinite(interest) && interest !== 0) ? ebit / interest : null,
      impliedTaxRate: (Number.isFinite(ebit) && Number.isFinite(interest) && Number.isFinite(latest(is.taxExpense)) && (ebit - interest) !== 0)
        ? latest(is.taxExpense) / (ebit - interest) : null
    };
  }

  return { latest, costOfCapital, bridge, baseYear };
});
