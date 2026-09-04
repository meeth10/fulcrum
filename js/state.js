/**
 * FULCRUM — state.js
 * Single source of truth for the whole app. Plain object + tiny pub/sub.
 * No framework. Views subscribe to 'change' and re-render themselves.
 */
(function (root) {
  const LS_KEY = 'fulcrum.case.v1';

  function defaultState() {
    return {
      meta: { version: 1, savedAt: null, caseName: 'Untitled Case' },

      company: {
        name: '', ticker: '', currency: 'USD',
        sharesOutstanding: null, currentPrice: null, valuationDate: ''
      },

      // Historical actuals — up to 5 fiscal years, most recent last.
      statements: {
        years: [], // e.g. ['FY23','FY24','FY25']
        income: { revenue: [], cogs: [], sgna: [], da: [], ebit: [], interestExpense: [], taxExpense: [], netIncome: [] },
        balance: { cash: [], shortTermDebt: [], longTermDebt: [], totalDebt: [], minorityInterest: [], preferredStock: [], totalEquity: [] },
        cashflow: { da: [], capex: [], nwcChange: [], netBorrowing: [] }
      },

      costOfCapital: {
        riskFreeRate: 0.042,
        equityRiskPremium: 0.046,
        sizePremium: 0,
        countryRiskPremium: 0,
        betaMode: 'bottomUp', // 'bottomUp' | 'direct'
        directBeta: 1.0,
        comps: [ // for bottom-up beta
          // { id, name, beta, de, taxRate }
        ],
        targetDE: 0.25,
        costOfDebtMethod: 'direct', // 'direct' | 'synthetic'
        directCostOfDebtPretax: 0.055,
        interestCoverageRatio: 6.0,
        taxRate: 0.25,
        marketValueEquity: null,   // if blank, derived from price * shares
        marketValueDebt: null      // if blank, derived from latest totalDebt
      },

      scenarios: [
        // { id, name, color, probability, valuationMode: 'FCFF'|'FCFE',
        //   waccOverride: null, costOfEquityOverride: null,
        //   assumptions: { baseRevenue, forecastYears, revenueGrowthStart, revenueGrowthEnd, growthCurve,
        //                  ebitMarginStart, ebitMarginEnd, marginCurve, taxRate,
        //                  daPctRevenueStart, daPctRevenueEnd, capexPctRevenueStart, capexPctRevenueEnd,
        //                  nwcPctRevenueChangeStart, nwcPctRevenueChangeEnd,
        //                  terminalMethod, terminalGrowthRate, exitMultiple, exitMultipleMetric } }
      ],

      sensitivity: {
        scenarioId: null,
        xVar: 'wacc', xMin: 0.07, xMax: 0.11, xStep: 0.01,
        yVar: 'terminalGrowth', yMin: 0.02, yMax: 0.04, yStep: 0.005,
        thirdVar: 'revenueGrowth', thirdValue: null
      },

      settings: {
        midYearConvention: true,
        valuationApproachPrimary: 'FCFF' // which bridge is "the" headline number: 'FCFF' | 'FCFE'
      },

      github: { owner: '', repo: '', path: 'cases', branch: 'main' } // token is NEVER stored in state/localStorage
    };
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function makeStore() {
    let state = loadDraft() || defaultState();
    const listeners = new Set();

    function get() { return state; }

    /** Replace the whole state (e.g. after loading a case from GitHub). */
    function set(next) {
      state = next;
      persistDraft();
      emit();
    }

    function setAtPath(path, value) {
      const parts = path.split('.');
      let node = state;
      for (let i = 0; i < parts.length - 1; i++) {
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
    }

    /** Patch + full re-render. Use for structural changes (add/remove row, toggle, select). */
    function patch(path, value) {
      setAtPath(path, value);
      persistDraft();
      emit();
    }

    /** Patch WITHOUT re-render — for live text/number typing, so the input never loses focus.
     *  Callers are responsible for updating any dependent on-screen figures themselves. */
    function patchQuiet(path, value) {
      setAtPath(path, value);
      persistDraft();
    }

    /** Direct mutate-and-notify escape hatch for array operations (add/remove scenario, comp row, etc). */
    function mutate(fn) {
      fn(state);
      persistDraft();
      emit();
    }

    /** Same as mutate but without triggering a re-render. */
    function mutateQuiet(fn) {
      fn(state);
      persistDraft();
    }

    function subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    function emit() {
      listeners.forEach((fn) => fn(state));
    }

    function persistDraft() {
      try {
        state.meta.savedAt = new Date().toISOString();
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch (e) {
        // localStorage can fail (private browsing, quota) — non-fatal, in-memory state still works.
        console.warn('FULCRUM: local autosave failed', e);
      }
    }

    function loadDraft() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function reset() {
      set(defaultState());
    }

    return { get, set, patch, patchQuiet, mutate, mutateQuiet, subscribe, reset };
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.State = { makeStore, defaultState, uid };
})(window);
