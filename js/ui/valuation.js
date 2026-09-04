(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;
  const DCF = root.Fulcrum.DCF;
  const Derive = root.Fulcrum.Derive;

  let activeScenarioId = null;

  function yearHeaders(n) {
    return Array.from({ length: n }, (_, i) => `Yr ${i + 1}`);
  }

  function cashflowTable(proj, currency) {
    const rows = [
      { label: 'Revenue', arr: proj.revenue },
      { label: 'EBIT', arr: proj.ebit },
      { label: 'NOPAT (EBIT × (1−t))', arr: proj.nopat },
      { label: '+ D&A', arr: proj.da },
      { label: '− CapEx', arr: proj.capex.map((v) => -v) },
      { label: '− Δ NWC', arr: proj.deltaNWC.map((v) => -v) },
      { label: 'FCFF', arr: proj.fcff, total: true }
    ];
    return `
      <table class="ledger">
        <thead><tr><th style="text-align:left;">Explicit period</th>${yearHeaders(proj.years).map((y) => `<th>${y}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr class="${r.total ? 'total' : ''}"><td>${r.label}</td>${r.arr.map((v) => `<td class="mono">${F.money(v, currency)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function bridgeTable(fcffResult, bridge, currency) {
    return `
      <table class="ledger">
        <tbody>
          <tr><td>PV of explicit-period FCFF</td><td class="mono">${F.money(fcffResult.pvExplicit, currency)}</td></tr>
          <tr><td>PV of terminal value</td><td class="mono">${F.money(fcffResult.pvTerminal, currency)}</td></tr>
          <tr class="total"><td>Enterprise / Firm value</td><td class="mono">${F.money(fcffResult.firmValue, currency)}</td></tr>
          <tr><td>− Total debt</td><td class="mono">${F.money(-bridge.totalDebt, currency)}</td></tr>
          <tr><td>− Minority interest</td><td class="mono">${F.money(-bridge.minorityInterest, currency)}</td></tr>
          <tr><td>− Preferred stock</td><td class="mono">${F.money(-bridge.preferredStock, currency)}</td></tr>
          <tr><td>+ Cash &amp; equivalents</td><td class="mono">${F.money(bridge.cashAndEquivalents, currency)}</td></tr>
          <tr class="total"><td>Equity value</td><td class="mono">${F.money(fcffResult.equityValue, currency)}</td></tr>
        </tbody>
      </table>
    `;
  }

  function detailPanel(scenario, state) {
    const cc = Derive.costOfCapital(state);
    const bridge = Derive.bridge(state);
    const shares = state.company.sharesOutstanding;
    const midYear = state.settings.midYearConvention;
    const currency = state.company.currency;

    const wacc = scenario.waccOverride != null ? scenario.waccOverride : cc.wacc;
    const ke = scenario.costOfEquityOverride != null ? scenario.costOfEquityOverride : cc.costOfEquity;

    if (!Number.isFinite(wacc) && scenario.valuationMode === 'FCFF') {
      return `<div class="callout danger"><span class="callout-title">Missing WACC</span>Set market value of equity/debt in Step 03, or give this scenario a WACC override.</div>`;
    }
    if (!Number.isFinite(ke) && scenario.valuationMode === 'FCFE') {
      return `<div class="callout danger"><span class="callout-title">Missing cost of equity</span>Complete CAPM inputs in Step 03, or give this scenario a cost-of-equity override.</div>`;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      return `<div class="callout danger"><span class="callout-title">Missing share count</span>Enter diluted shares outstanding in Step 01.</div>`;
    }

    const fcffResult = DCF.runFCFFValuation(scenario.assumptions, Number.isFinite(wacc) ? wacc : 0.1, bridge, shares, midYear);
    let fcfeResult = null, reconcile = null;
    try {
      fcfeResult = DCF.runFCFEValuation(scenario.assumptions, Number.isFinite(ke) ? ke : 0.1, shares, midYear);
      reconcile = DCF.reconcile(fcffResult.equityValue, fcfeResult.equityValue);
    } catch (e) { /* fcfe optional path — fine if it fails */ }

    const primary = scenario.valuationMode === 'FCFE' && fcfeResult ? fcfeResult : fcffResult;

    return `
      <div class="stat-row mb-0" style="margin-bottom:18px;">
        <div class="stat">
          <div class="stat-label">${scenario.valuationMode === 'FCFE' ? 'Equity value (FCFE)' : 'Firm value (FCFF)'}</div>
          <div class="stat-value oxblood">${F.money(scenario.valuationMode === 'FCFE' ? fcfeResult.equityValue : fcffResult.firmValue, currency, 0)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Equity value</div>
          <div class="stat-value">${F.money(primary.equityValue, currency, 0)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Price per share</div>
          <div class="stat-value forest">${F.price(primary.pricePerShare, currency)}</div>
          ${Number.isFinite(state.company.currentPrice) ? `<div class="stat-sub">${primary.pricePerShare > state.company.currentPrice ? 'above' : 'below'} current price ${F.price(state.company.currentPrice, currency)} by ${F.pct(Math.abs(primary.pricePerShare - state.company.currentPrice) / state.company.currentPrice, 1)}</div>` : ''}
        </div>
        <div class="stat">
          <div class="stat-label">Discount rate used</div>
          <div class="stat-value" style="font-size:22px;">${F.pct(scenario.valuationMode === 'FCFE' ? ke : wacc, 2)}</div>
          <div class="stat-sub">${(scenario.valuationMode === 'FCFE' ? scenario.costOfEquityOverride : scenario.waccOverride) != null ? 'scenario override' : 'from Step 03'}</div>
        </div>
      </div>

      ${reconcile && reconcile.flag ? `
        <div class="callout danger">
          <span class="callout-title">Reconciliation flag</span>
          FCFF-route equity value (${F.money(fcffResult.equityValue, currency, 0)}) and FCFE-route equity value (${F.money(fcfeResult.equityValue, currency, 0)}) diverge by ${F.pct(reconcile.pctDifference, 1)}.
          Usually means net borrowing / interest assumptions aren't consistent with the leverage implied by the WACC weights — worth a look before this goes in a deck.
        </div>` : reconcile ? `
        <div class="callout">
          <span class="callout-title">Reconciliation check</span>
          FCFF and FCFE routes agree within ${F.pct(Math.abs(reconcile.pctDifference), 1)} — a reasonable cross-check that the leverage assumptions are internally consistent.
        </div>` : ''}

      <div class="card-title mt-24">FCFF build — explicit period</div>
      ${cashflowTable(fcffResult.proj, currency)}

      <div class="grid-2 mt-16">
        <div>
          <div class="card-title">Firm → equity bridge</div>
          ${bridgeTable(fcffResult, bridge, currency)}
        </div>
        <div>
          <div class="card-title">Terminal value detail</div>
          <table class="ledger">
            <tbody>
              <tr><td>Method</td><td class="mono">${scenario.assumptions.terminalMethod === 'gordon' ? 'Gordon growth' : 'Exit multiple'}</td></tr>
              ${scenario.assumptions.terminalMethod === 'gordon'
                ? `<tr><td>Terminal growth</td><td class="mono">${F.pct(scenario.assumptions.terminalGrowthRate, 1)}</td></tr>`
                : `<tr><td>Multiple applied</td><td class="mono">${F.multiple(scenario.assumptions.exitMultiple)} ${scenario.assumptions.exitMultipleMetric}</td></tr>`}
              <tr class="total"><td>Terminal value (undiscounted)</td><td class="mono">${F.money(fcffResult.terminalValue, currency, 0)}</td></tr>
              <tr><td>% of firm value from TV</td><td class="mono">${F.pct(fcffResult.pvTerminal / fcffResult.firmValue, 0)}</td></tr>
            </tbody>
          </table>
          ${scenario.assumptions.terminalMethod === 'gordon' && wacc <= scenario.assumptions.terminalGrowthRate
            ? `<div class="callout danger mt-8"><span class="callout-title">Invalid Gordon growth</span>Terminal growth must be below the discount rate — Damodaran's ceiling is roughly the long-run risk-free rate.</div>` : ''}
          ${scenario.assumptions.terminalMethod === 'gordon' && (fcffResult.pvTerminal / fcffResult.firmValue) > 0.85
            ? `<div class="callout mt-8"><span class="callout-title">High terminal weight</span>Over 85% of firm value sits in the terminal value — normal for early-stage names, but worth flagging in the memo.</div>` : ''}
        </div>
      </div>
    `;
  }

  function render(container, store) {
    const state = store.get();

    if (state.scenarios.length === 0) {
      container.innerHTML = `
        <div class="section-head">
          <span class="section-eyebrow">05 — Valuation</span>
          <h1>Valuation Output</h1>
        </div>
        <div class="callout">No scenarios defined yet — head back to Step 04 to add at least one case.</div>
      `;
      return;
    }

    if (!activeScenarioId || !state.scenarios.find((s) => s.id === activeScenarioId)) {
      activeScenarioId = state.scenarios[0].id;
    }

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">05 — Valuation</span>
        <h1>Valuation Output</h1>
        <p class="section-dek">The full explicit-period build, the firm-to-equity bridge, and an FCFF/FCFE cross-check — for each case, in the currency and units set in Step 01.</p>
      </div>

      <div class="tabbar" id="scn-tabbar">
        ${state.scenarios.map((s) => `<button data-id="${s.id}" class="${s.id === activeScenarioId ? 'active' : ''}" style="border-bottom-color:${s.id === activeScenarioId ? s.color : 'transparent'}; color:${s.id === activeScenarioId ? s.color : ''};">${H.escapeHtml(s.name)}</button>`).join('')}
      </div>

      <div id="scn-detail"></div>
    `;

    const detailMount = H.$(container, '#scn-detail');
    const activeScenario = state.scenarios.find((s) => s.id === activeScenarioId);
    detailMount.innerHTML = detailPanel(activeScenario, state);

    H.$all(container, '#scn-tabbar button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeScenarioId = btn.dataset.id;
        render(container, store);
      });
    });
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Valuation = { render };
})(window);
