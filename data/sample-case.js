/**
 * FULCRUM — sample-case.js
 * A fully fictional company ("Meridian Instruments") used purely to demonstrate
 * the tool end-to-end. Not real financial data. Loaded on demand via
 * "Load Sample Case" — never auto-applied over a user's own work.
 */
(function (root) {
  function sampleCase() {
    return {
      meta: { version: 1, savedAt: null, caseName: 'Meridian Instruments — Illustrative Case' },

      company: {
        name: 'Meridian Instruments, Inc.', ticker: 'MRDN', currency: 'USD',
        sharesOutstanding: 142.5, currentPrice: 61.20, valuationDate: new Date().toISOString().slice(0, 10)
      },

      statements: {
        years: ['FY23', 'FY24', 'FY25'],
        income: {
          revenue: [1840, 2065, 2312],
          cogs: [1104, 1218, 1341],
          sgna: [368, 402, 439],
          da: [92, 103, 116],
          ebit: [276, 342, 416],
          interestExpense: [38, 41, 43],
          taxExpense: [57, 73, 91],
          netIncome: [181, 228, 282]
        },
        balance: {
          cash: [214, 261, 305],
          shortTermDebt: [40, 35, 30],
          longTermDebt: [560, 545, 520],
          totalDebt: [600, 580, 550],
          minorityInterest: [0, 0, 0],
          preferredStock: [0, 0, 0],
          totalEquity: [1120, 1310, 1548]
        },
        cashflow: {
          da: [92, 103, 116],
          capex: [128, 145, 162],
          nwcChange: [22, 28, 31],
          netBorrowing: [-15, -20, -30]
        }
      },

      costOfCapital: {
        riskFreeRate: 0.042,
        equityRiskPremium: 0.046,
        sizePremium: 0.005,
        countryRiskPremium: 0,
        betaMode: 'bottomUp',
        directBeta: 1.05,
        comps: [
          { id: 'c1', name: 'Analog Precision Corp', beta: 1.10, de: 0.30, taxRate: 0.25 },
          { id: 'c2', name: 'Halcyon Sensors', beta: 0.92, de: 0.12, taxRate: 0.24 },
          { id: 'c3', name: 'Vantage Metrology', beta: 1.22, de: 0.48, taxRate: 0.25 },
          { id: 'c4', name: 'Corvid Industrial', beta: 1.02, de: 0.22, taxRate: 0.26 }
        ],
        targetDE: 0.27,
        costOfDebtMethod: 'synthetic',
        directCostOfDebtPretax: 0.058,
        interestCoverageRatio: 9.7,
        taxRate: 0.25,
        marketValueEquity: null,
        marketValueDebt: null
      },

      scenarios: [
        {
          id: 'bull', name: 'Bull', color: '#1F4D3A', probability: 0.25, valuationMode: 'FCFF',
          waccOverride: null, costOfEquityOverride: null,
          assumptions: {
            baseRevenue: 2312, forecastYears: 5,
            revenueGrowthStart: 0.14, revenueGrowthEnd: 0.06, growthCurve: 'frontloaded',
            ebitMarginStart: 0.18, ebitMarginEnd: 0.21, marginCurve: 'linear',
            taxRate: 0.25,
            daPctRevenueStart: 0.050, daPctRevenueEnd: 0.048,
            capexPctRevenueStart: 0.070, capexPctRevenueEnd: 0.055,
            nwcPctRevenueChangeStart: 0.12, nwcPctRevenueChangeEnd: 0.12,
            terminalMethod: 'gordon', terminalGrowthRate: 0.032, exitMultiple: 11, exitMultipleMetric: 'EBITDA'
          }
        },
        {
          id: 'base', name: 'Base', color: '#7A2E2E', probability: 0.50, valuationMode: 'FCFF',
          waccOverride: null, costOfEquityOverride: null,
          assumptions: {
            baseRevenue: 2312, forecastYears: 5,
            revenueGrowthStart: 0.11, revenueGrowthEnd: 0.045, growthCurve: 'linear',
            ebitMarginStart: 0.18, ebitMarginEnd: 0.19, marginCurve: 'linear',
            taxRate: 0.25,
            daPctRevenueStart: 0.050, daPctRevenueEnd: 0.050,
            capexPctRevenueStart: 0.070, capexPctRevenueEnd: 0.062,
            nwcPctRevenueChangeStart: 0.12, nwcPctRevenueChangeEnd: 0.12,
            terminalMethod: 'gordon', terminalGrowthRate: 0.028, exitMultiple: 9.5, exitMultipleMetric: 'EBITDA'
          }
        },
        {
          id: 'bear', name: 'Bear', color: '#8A6A2A', probability: 0.25, valuationMode: 'FCFF',
          waccOverride: null, costOfEquityOverride: null,
          assumptions: {
            baseRevenue: 2312, forecastYears: 5,
            revenueGrowthStart: 0.07, revenueGrowthEnd: 0.02, growthCurve: 'backloaded',
            ebitMarginStart: 0.18, ebitMarginEnd: 0.165, marginCurve: 'linear',
            taxRate: 0.25,
            daPctRevenueStart: 0.050, daPctRevenueEnd: 0.052,
            capexPctRevenueStart: 0.070, capexPctRevenueEnd: 0.068,
            nwcPctRevenueChangeStart: 0.12, nwcPctRevenueChangeEnd: 0.12,
            terminalMethod: 'gordon', terminalGrowthRate: 0.022, exitMultiple: 7.5, exitMultipleMetric: 'EBITDA'
          }
        }
      ],

      sensitivity: {
        scenarioId: 'base',
        xVar: 'wacc', xMin: 0.075, xMax: 0.105, xStep: 0.0075,
        yVar: 'terminalGrowth', yMin: 0.018, yMax: 0.038, yStep: 0.005,
        thirdVar: 'revenueGrowth', thirdValue: null
      },

      settings: { midYearConvention: true, valuationApproachPrimary: 'FCFF' },

      github: { owner: '', repo: '', path: 'cases', branch: 'main' }
    };
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.SampleCase = sampleCase;
})(window);
