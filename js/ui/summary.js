(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;
  const Utils = root.Fulcrum.Utils;
  const Derive = root.Fulcrum.Derive;
  const Scenarios = root.Fulcrum.Scenarios;
  const Charts = root.Fulcrum.Charts;

  function buildScenarioInputs(state) {
    const cc = Derive.costOfCapital(state);
    return state.scenarios.map((s) => ({
      ...s,
      wacc: s.waccOverride != null ? s.waccOverride : cc.wacc,
      costOfEquity: s.costOfEquityOverride != null ? s.costOfEquityOverride : cc.costOfEquity
    }));
  }

  function render(container, store) {
    const state = store.get();

    if (state.scenarios.length === 0) {
      container.innerHTML = `
        <div class="section-head"><span class="section-eyebrow">07 — Summary</span><h1>Fair Value Summary</h1></div>
        <div class="callout">No scenarios defined yet — head back to Step 04 to add at least one case.</div>`;
      return;
    }

    const scenarioInputs = buildScenarioInputs(state);
    const missingRate = scenarioInputs.find((s) => !Number.isFinite(s.valuationMode === 'FCFE' ? s.costOfEquity : s.wacc));
    if (missingRate) {
      container.innerHTML = `
        <div class="section-head"><span class="section-eyebrow">07 — Summary</span><h1>Fair Value Summary</h1></div>
        <div class="callout danger"><span class="callout-title">Missing discount rate</span>"${H.escapeHtml(missingRate.name)}" has no usable WACC / cost of equity — complete Step 03 or set a per-scenario override in Step 04.</div>`;
      return;
    }
    if (!Number.isFinite(state.company.sharesOutstanding) || state.company.sharesOutstanding <= 0) {
      container.innerHTML = `
        <div class="section-head"><span class="section-eyebrow">07 — Summary</span><h1>Fair Value Summary</h1></div>
        <div class="callout danger"><span class="callout-title">Missing share count</span>Enter diluted shares outstanding in Step 01.</div>`;
      return;
    }

    const sens = state.sensitivity;
    const xRange = Utils.range(sens.xMin, sens.xMax, sens.xStep);
    const yRange = Utils.range(sens.yMin, sens.yMax, sens.yStep);

    const shared = {
      bridge: Derive.bridge(state),
      sharesOutstanding: state.company.sharesOutstanding,
      midYear: state.settings.midYearConvention,
      sensitivityConfig: { xVar: sens.xVar, xRange, yVar: sens.yVar, yRange }
    };

    const out = Scenarios.runAll(scenarioInputs, shared);
    const currency = state.company.currency;

    const rows = out.results.map((r) => ({
      label: r.name, min: r.range.min, max: r.range.max, point: r.point.pricePerShare, color: r.color
    }));

    const markers = [
      { value: out.weightedFairValue, label: `Weighted ${F.price(out.weightedFairValue, currency)}`, kind: 'weighted' },
      { value: out.medianFairValue, label: `Median ${F.price(out.medianFairValue, currency)}`, kind: 'median' }
    ];
    if (Number.isFinite(state.company.currentPrice)) {
      markers.push({ value: state.company.currentPrice, label: `Market ${F.price(state.company.currentPrice, currency)}`, kind: 'market' });
    }

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">07 — Summary</span>
        <h1>Fair Value Summary</h1>
        <p class="section-dek">Every case, weighted by how likely you think it is — plus the median across ${out.distribution.length.toLocaleString()} simulated outcomes drawn from each case's own sensitivity grid, not just the three headline points.</p>
      </div>

      <div class="card">
        <div class="stat-row">
          <div class="stat">
            <div class="stat-label">Probability-weighted fair value</div>
            <div class="stat-value oxblood" style="font-size:40px;">${F.price(out.weightedFairValue, currency)}</div>
            <div class="stat-sub">${out.weightCheck.valid ? '' : `⚠ probabilities sum to ${F.pct(out.weightCheck.total, 0)}`}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Median fair value</div>
            <div class="stat-value" style="font-size:40px;">${F.price(out.medianFairValue, currency)}</div>
            <div class="stat-sub">across full simulated grid</div>
          </div>
          <div class="stat">
            <div class="stat-label">Dispersion (\u03c3)</div>
            <div class="stat-value" style="font-size:40px;">${F.price(out.dispersion, currency)}</div>
            <div class="stat-sub">${F.pct(out.dispersion / out.weightedFairValue, 0)} of weighted fair value</div>
          </div>
          ${Number.isFinite(state.company.currentPrice) ? `
          <div class="stat">
            <div class="stat-label">Vs. current market price</div>
            <div class="stat-value ${out.weightedFairValue >= state.company.currentPrice ? 'forest' : 'oxblood'}" style="font-size:40px;">${out.weightedFairValue >= state.company.currentPrice ? '+' : ''}${F.pct((out.weightedFairValue - state.company.currentPrice) / state.company.currentPrice, 0)}</div>
            <div class="stat-sub">market at ${F.price(state.company.currentPrice, currency)}</div>
          </div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Football field<span class="hint">range = each case's own sensitivity grid; tick = point estimate</span></div>
        <div id="ff-mount"></div>
      </div>

      <div class="card">
        <div class="card-title">Case detail</div>
        <table class="ledger">
          <thead><tr><th style="text-align:left;">Case</th><th>Probability</th><th>Point price</th><th>Grid range</th><th>Discount rate</th></tr></thead>
          <tbody>
            ${out.results.map((r) => `
              <tr>
                <td><span class="scenario-swatch" style="background:${r.color}; display:inline-block; margin-right:8px;"></span>${H.escapeHtml(r.name)}</td>
                <td class="mono">${F.pct(r.probability, 0)}</td>
                <td class="mono">${F.price(r.point.pricePerShare, currency)}</td>
                <td class="mono">${F.price(r.range.min, currency)} \u2013 ${F.price(r.range.max, currency)}</td>
                <td class="mono">${F.pct(r.valuationMode === 'FCFE' ? r.costOfEquity : r.wacc, 2)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="callout">
        <span class="callout-title">Reading this page</span>
        The weighted fair value takes each case's single point estimate and blends by probability — a clean headline number for a memo.
        The median instead pools every outcome across every case's full sensitivity grid (${out.distribution.length.toLocaleString()} data points here) and takes the middle — a more robust central tendency when a case's range is wide or skewed.
        When the two disagree by a lot, the distribution is skewed rather than symmetric — worth a sentence in the write-up.
      </div>

      <div class="footer-note">FULCRUM \u2014 every input above was typed in, not fetched or inferred. Generated ${new Date().toLocaleString()}.</div>
    `;

    Charts.renderFootballField(H.$(container, '#ff-mount'), rows, markers, currency);
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Summary = { render };
})(window);
