(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;
  const DCF = root.Fulcrum.DCF;
  const Derive = root.Fulcrum.Derive;
  const Utils = root.Fulcrum.Utils;

  const DEFAULT_COLORS = ['#1F4D3A', '#7A2A2A', '#9C7A2E', '#33475B', '#5C2020', '#4A4238'];

  function newScenario(state, idx) {
    const base = Derive.baseYear(state);
    return {
      id: root.Fulcrum.State.uid('scn'),
      name: `Case ${state.scenarios.length + 1}`,
      color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      probability: state.scenarios.length === 0 ? 1 : 0,
      valuationMode: 'FCFF',
      waccOverride: null,
      costOfEquityOverride: null,
      assumptions: {
        baseRevenue: base.revenue || 1000,
        forecastYears: 5,
        revenueGrowthStart: 0.08, revenueGrowthEnd: 0.04, growthCurve: 'linear',
        ebitMarginStart: base.ebitMargin || 0.18, ebitMarginEnd: base.ebitMargin || 0.18, marginCurve: 'linear',
        taxRate: state.costOfCapital.taxRate || 0.25,
        daPctRevenueStart: base.daPctRevenue || 0.05, daPctRevenueEnd: base.daPctRevenue || 0.05,
        capexPctRevenueStart: base.capexPctRevenue || 0.06, capexPctRevenueEnd: base.capexPctRevenue || 0.06,
        nwcPctRevenueChangeStart: 0.10, nwcPctRevenueChangeEnd: 0.10,
        terminalMethod: 'gordon', terminalGrowthRate: 0.025, exitMultiple: 9, exitMultipleMetric: 'EBITDA'
      }
    };
  }

  function loadTemplate(store) {
    store.mutate((state) => {
      const base = Derive.baseYear(state);
      const rev = base.revenue || 1000;
      const margin = base.ebitMargin || 0.18;
      state.scenarios = [
        { id: root.Fulcrum.State.uid('scn'), name: 'Bull', color: DEFAULT_COLORS[0], probability: 0.25, valuationMode: 'FCFF', waccOverride: null, costOfEquityOverride: null,
          assumptions: { baseRevenue: rev, forecastYears: 5, revenueGrowthStart: 0.13, revenueGrowthEnd: 0.06, growthCurve: 'frontloaded', ebitMarginStart: margin, ebitMarginEnd: margin + 0.02, marginCurve: 'linear', taxRate: state.costOfCapital.taxRate || 0.25, daPctRevenueStart: base.daPctRevenue || 0.05, daPctRevenueEnd: base.daPctRevenue || 0.05, capexPctRevenueStart: base.capexPctRevenue || 0.06, capexPctRevenueEnd: (base.capexPctRevenue || 0.06) * 0.9, nwcPctRevenueChangeStart: 0.10, nwcPctRevenueChangeEnd: 0.10, terminalMethod: 'gordon', terminalGrowthRate: 0.032, exitMultiple: 10, exitMultipleMetric: 'EBITDA' } },
        { id: root.Fulcrum.State.uid('scn'), name: 'Base', color: DEFAULT_COLORS[1], probability: 0.50, valuationMode: 'FCFF', waccOverride: null, costOfEquityOverride: null,
          assumptions: { baseRevenue: rev, forecastYears: 5, revenueGrowthStart: 0.09, revenueGrowthEnd: 0.04, growthCurve: 'linear', ebitMarginStart: margin, ebitMarginEnd: margin, marginCurve: 'linear', taxRate: state.costOfCapital.taxRate || 0.25, daPctRevenueStart: base.daPctRevenue || 0.05, daPctRevenueEnd: base.daPctRevenue || 0.05, capexPctRevenueStart: base.capexPctRevenue || 0.06, capexPctRevenueEnd: base.capexPctRevenue || 0.06, nwcPctRevenueChangeStart: 0.10, nwcPctRevenueChangeEnd: 0.10, terminalMethod: 'gordon', terminalGrowthRate: 0.026, exitMultiple: 8.5, exitMultipleMetric: 'EBITDA' } },
        { id: root.Fulcrum.State.uid('scn'), name: 'Bear', color: DEFAULT_COLORS[2], probability: 0.25, valuationMode: 'FCFF', waccOverride: null, costOfEquityOverride: null,
          assumptions: { baseRevenue: rev, forecastYears: 5, revenueGrowthStart: 0.05, revenueGrowthEnd: 0.015, growthCurve: 'backloaded', ebitMarginStart: margin, ebitMarginEnd: margin - 0.02, marginCurve: 'linear', taxRate: state.costOfCapital.taxRate || 0.25, daPctRevenueStart: base.daPctRevenue || 0.05, daPctRevenueEnd: (base.daPctRevenue || 0.05) * 1.05, capexPctRevenueStart: base.capexPctRevenue || 0.06, capexPctRevenueEnd: (base.capexPctRevenue || 0.06) * 1.1, nwcPctRevenueChangeStart: 0.10, nwcPctRevenueChangeEnd: 0.10, terminalMethod: 'gordon', terminalGrowthRate: 0.018, exitMultiple: 6.5, exitMultipleMetric: 'EBITDA' } }
      ];
    });
  }

  function livePrice(scenario, state) {
    const cc = Derive.costOfCapital(state);
    const bridge = Derive.bridge(state);
    const shares = state.company.sharesOutstanding;
    const midYear = state.settings.midYearConvention;
    try {
      if (scenario.valuationMode === 'FCFE') {
        const ke = scenario.costOfEquityOverride != null ? scenario.costOfEquityOverride : cc.costOfEquity;
        return DCF.runFCFEValuation(scenario.assumptions, ke, shares, midYear).pricePerShare;
      }
      const w = scenario.waccOverride != null ? scenario.waccOverride : cc.wacc;
      if (!Number.isFinite(w)) return null;
      return DCF.runFCFFValuation(scenario.assumptions, w, bridge, shares, midYear).pricePerShare;
    } catch (e) {
      return null;
    }
  }

  function probabilitySummary(container, store) {
    const state = store.get();
    const total = Utils.sum(state.scenarios.map((s) => s.probability));
    const el = H.$(container, '#prob-summary');
    if (!el) return;
    const ok = Math.abs(total - 1) < 0.005;
    el.innerHTML = `<span class="tag ${ok ? 'tag-forest' : 'tag-danger'}">Probabilities sum to ${F.pct(total, 0)}${ok ? '' : ' — should be 100%'}</span>`;
  }

  function scenarioCard(scenario, state) {
    const a = scenario.assumptions;
    const price = livePrice(scenario, state);
    return `
    <div class="card scenario-card" style="border-left-color:${scenario.color};" data-id="${scenario.id}">
      <div class="scenario-name-row">
        <span class="scenario-swatch" style="background:${scenario.color};"></span>
        <input type="text" class="scn-name" data-id="${scenario.id}" value="${H.escapeHtml(scenario.name)}">
        <span class="prob-badge"><input type="number" class="scn-prob mono" data-id="${scenario.id}" value="${(scenario.probability * 100).toFixed(0)}" style="width:52px; border:none; background:transparent; text-align:right; font-family:var(--font-mono); font-size:13px; font-weight:700; color:inherit;">%</span>
        <button class="icon-btn scn-remove" data-id="${scenario.id}" title="Remove scenario">✕</button>
      </div>

      <div class="flex gap-16 mt-8" style="flex-wrap:wrap;">
        <div class="field" style="max-width:150px;">
          <label>Valuation route</label>
          <select class="scn-mode" data-id="${scenario.id}">
            <option value="FCFF" ${scenario.valuationMode === 'FCFF' ? 'selected' : ''}>FCFF → Firm value</option>
            <option value="FCFE" ${scenario.valuationMode === 'FCFE' ? 'selected' : ''}>FCFE → Equity value</option>
          </select>
        </div>
        <div class="field" style="max-width:110px;">
          <label>Forecast yrs</label>
          <input type="number" class="mono scn-field" data-id="${scenario.id}" data-path="forecastYears" value="${a.forecastYears}" min="3" max="10" step="1">
        </div>
        <div class="field" style="max-width:150px;">
          <label>Base revenue</label>
          <input type="number" class="mono scn-field" data-id="${scenario.id}" data-path="baseRevenue" value="${a.baseRevenue}" step="1">
        </div>
        <div class="field" style="max-width:130px;">
          <label>Tax rate</label>
          <div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="taxRate" value="${(a.taxRate * 100).toFixed(1)}" step="0.5"></div>
        </div>
      </div>

      <hr class="rule">

      <div class="grid-3">
        <div>
          <div class="field-label-row"><strong class="small">Revenue growth</strong></div>
          <div class="grid-2 gap-8">
            <div class="field"><label>Yr 1</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="revenueGrowthStart" value="${(a.revenueGrowthStart * 100).toFixed(1)}" step="0.5"></div></div>
            <div class="field"><label>Terminal yr</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="revenueGrowthEnd" value="${(a.revenueGrowthEnd * 100).toFixed(1)}" step="0.5"></div></div>
          </div>
          <select class="scn-field" data-id="${scenario.id}" data-path="growthCurve" style="margin-top:2px;">
            <option value="linear" ${a.growthCurve === 'linear' ? 'selected' : ''}>Linear fade</option>
            <option value="frontloaded" ${a.growthCurve === 'frontloaded' ? 'selected' : ''}>Front-loaded</option>
            <option value="backloaded" ${a.growthCurve === 'backloaded' ? 'selected' : ''}>Back-loaded</option>
          </select>
        </div>

        <div>
          <div class="field-label-row"><strong class="small">EBIT margin</strong></div>
          <div class="grid-2 gap-8">
            <div class="field"><label>Yr 1</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="ebitMarginStart" value="${(a.ebitMarginStart * 100).toFixed(1)}" step="0.25"></div></div>
            <div class="field"><label>Terminal yr</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="ebitMarginEnd" value="${(a.ebitMarginEnd * 100).toFixed(1)}" step="0.25"></div></div>
          </div>
          <select class="scn-field" data-id="${scenario.id}" data-path="marginCurve" style="margin-top:2px;">
            <option value="linear" ${a.marginCurve === 'linear' ? 'selected' : ''}>Linear fade</option>
            <option value="frontloaded" ${a.marginCurve === 'frontloaded' ? 'selected' : ''}>Front-loaded</option>
            <option value="backloaded" ${a.marginCurve === 'backloaded' ? 'selected' : ''}>Back-loaded</option>
          </select>
        </div>

        <div>
          <div class="field-label-row"><strong class="small">D&amp;A % of revenue</strong></div>
          <div class="grid-2 gap-8">
            <div class="field"><label>Yr 1</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="daPctRevenueStart" value="${(a.daPctRevenueStart * 100).toFixed(1)}" step="0.1"></div></div>
            <div class="field"><label>Terminal yr</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="daPctRevenueEnd" value="${(a.daPctRevenueEnd * 100).toFixed(1)}" step="0.1"></div></div>
          </div>
        </div>

        <div>
          <div class="field-label-row"><strong class="small">CapEx % of revenue</strong></div>
          <div class="grid-2 gap-8">
            <div class="field"><label>Yr 1</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="capexPctRevenueStart" value="${(a.capexPctRevenueStart * 100).toFixed(1)}" step="0.1"></div></div>
            <div class="field"><label>Terminal yr</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="capexPctRevenueEnd" value="${(a.capexPctRevenueEnd * 100).toFixed(1)}" step="0.1"></div></div>
          </div>
        </div>

        <div>
          <div class="field-label-row"><strong class="small">Δ NWC % of Δ revenue</strong></div>
          <div class="grid-2 gap-8">
            <div class="field"><label>Yr 1</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="nwcPctRevenueChangeStart" value="${(a.nwcPctRevenueChangeStart * 100).toFixed(1)}" step="0.5"></div></div>
            <div class="field"><label>Terminal yr</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="nwcPctRevenueChangeEnd" value="${(a.nwcPctRevenueChangeEnd * 100).toFixed(1)}" step="0.5"></div></div>
          </div>
        </div>

        <div>
          <div class="field-label-row"><strong class="small">Terminal value</strong></div>
          <select class="scn-field" data-id="${scenario.id}" data-path="terminalMethod">
            <option value="gordon" ${a.terminalMethod === 'gordon' ? 'selected' : ''}>Gordon growth</option>
            <option value="exitMultiple" ${a.terminalMethod === 'exitMultiple' ? 'selected' : ''}>Exit multiple</option>
          </select>
          <div class="grid-2 gap-8 mt-8">
            <div class="field ${a.terminalMethod !== 'gordon' ? 'hidden' : ''}" data-tv="gordon"><label>Terminal growth</label><div class="pct-input"><input type="number" class="mono scn-field-pct" data-id="${scenario.id}" data-path="terminalGrowthRate" value="${(a.terminalGrowthRate * 100).toFixed(1)}" step="0.1"></div></div>
            <div class="field ${a.terminalMethod !== 'exitMultiple' ? 'hidden' : ''}" data-tv="exitMultiple"><label>Multiple (×)</label><input type="number" class="mono scn-field" data-id="${scenario.id}" data-path="exitMultiple" value="${a.exitMultiple}" step="0.25"></div>
          </div>
        </div>
      </div>

      <hr class="rule">
      <div class="flex-between">
        <div class="field mb-0" style="max-width:220px;">
          <label>${scenario.valuationMode === 'FCFE' ? 'Cost of equity override' : 'WACC override'} <span class="muted">(blank = Step 03 value)</span></label>
          <div class="pct-input"><input type="number" class="mono scn-rate-override" data-id="${scenario.id}" value="${scenario.valuationMode === 'FCFE' ? (scenario.costOfEquityOverride != null ? (scenario.costOfEquityOverride * 100).toFixed(2) : '') : (scenario.waccOverride != null ? (scenario.waccOverride * 100).toFixed(2) : '')}" step="0.1"></div>
        </div>
        <div style="text-align:right;">
          <div class="stat-label">Implied price / share</div>
          <div class="stat-value oxblood scn-live-price" style="font-size:26px;">${F.price(price, state.company.currency)}</div>
        </div>
      </div>
    </div>`;
  }

  function bindScenarioEvents(container, store) {
    const rerender = () => render(container, store);

    H.$all(container, '.scn-name').forEach((el) => el.addEventListener('input', () => {
      store.mutateQuiet((st) => { st.scenarios.find((s) => s.id === el.dataset.id).name = el.value; });
    }));

    H.$all(container, '.scn-prob').forEach((el) => el.addEventListener('input', () => {
      const v = el.value === '' ? 0 : parseFloat(el.value) / 100;
      store.mutateQuiet((st) => { st.scenarios.find((s) => s.id === el.dataset.id).probability = v; });
      probabilitySummary(container, store);
    }));

    H.$all(container, '.scn-remove').forEach((el) => el.addEventListener('click', () => {
      store.mutate((st) => { st.scenarios = st.scenarios.filter((s) => s.id !== el.dataset.id); });
    }));

    H.$all(container, '.scn-mode').forEach((el) => el.addEventListener('change', () => {
      store.mutate((st) => { st.scenarios.find((s) => s.id === el.dataset.id).valuationMode = el.value; });
    }));

    function refreshLivePrice(id) {
      const state = store.get();
      const scenario = state.scenarios.find((s) => s.id === id);
      const card = H.$(container, `.scenario-card[data-id="${id}"]`);
      if (card && scenario) {
        H.$(card, '.scn-live-price').textContent = F.price(livePrice(scenario, state), state.company.currency);
      }
    }

    H.$all(container, '.scn-field').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const id = el.dataset.id, path = el.dataset.path;
      const v = el.type === 'number' ? (el.value === '' ? null : parseFloat(el.value)) : el.value;
      store.mutateQuiet((st) => { st.scenarios.find((s) => s.id === id).assumptions[path] = v; });
      if (path === 'terminalMethod') { rerender(); return; }
      refreshLivePrice(id);
    }));

    H.$all(container, '.scn-field-pct').forEach((el) => el.addEventListener('input', () => {
      const id = el.dataset.id, path = el.dataset.path;
      const v = el.value === '' ? null : parseFloat(el.value) / 100;
      store.mutateQuiet((st) => { st.scenarios.find((s) => s.id === id).assumptions[path] = v; });
      refreshLivePrice(id);
    }));

    H.$all(container, '.scn-rate-override').forEach((el) => el.addEventListener('input', () => {
      const id = el.dataset.id;
      const v = el.value === '' ? null : parseFloat(el.value) / 100;
      store.mutateQuiet((st) => {
        const scn = st.scenarios.find((s) => s.id === id);
        if (scn.valuationMode === 'FCFE') scn.costOfEquityOverride = v; else scn.waccOverride = v;
      });
      refreshLivePrice(id);
    }));
  }

  function render(container, store) {
    const state = store.get();

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">04 — Scenarios</span>
        <h1>Cases &amp; Assumptions</h1>
        <p class="section-dek">Define as many cases as the story needs. Each one is a fully independent DCF — its own growth, margin, and terminal assumptions, weighted by how likely you think it is.</p>
      </div>

      <div class="flex-between mb-16">
        <div id="prob-summary"></div>
        <div class="flex gap-8">
          ${state.scenarios.length === 0 ? '<button class="btn btn-ghost btn-sm" id="load-template">Start from Bull / Base / Bear</button>' : ''}
          <button class="btn btn-primary btn-sm" id="add-scenario">+ Add scenario</button>
        </div>
      </div>

      ${state.scenarios.length === 0 ? `
        <div class="callout">No scenarios yet. Add one, or start from a Bull / Base / Bear template and edit from there.</div>
      ` : state.scenarios.map((s) => scenarioCard(s, state)).join('')}
    `;

    probabilitySummary(container, store);

    const addBtn = H.$(container, '#add-scenario');
    if (addBtn) addBtn.addEventListener('click', () => {
      store.mutate((st) => { st.scenarios.push(newScenario(st, st.scenarios.length)); });
    });
    const tmplBtn = H.$(container, '#load-template');
    if (tmplBtn) tmplBtn.addEventListener('click', () => loadTemplate(store));

    bindScenarioEvents(container, store);
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Scenarios = { render };
})(window);
