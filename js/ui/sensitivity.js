(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;
  const Utils = root.Fulcrum.Utils;
  const Sensitivity = root.Fulcrum.Sensitivity;
  const Charts = root.Fulcrum.Charts;
  const Derive = root.Fulcrum.Derive;

  const VARS = {
    wacc: { label: 'WACC', unit: 'pct', step: 0.25 },
    terminalGrowth: { label: 'Terminal growth', unit: 'pct', step: 0.1 },
    revenueGrowth: { label: 'Terminal-yr revenue growth', unit: 'pct', step: 0.25 },
    ebitMargin: { label: 'Terminal-yr EBIT margin', unit: 'pct', step: 0.25 },
    exitMultiple: { label: 'Exit multiple', unit: 'x', step: 0.25 }
  };

  function currentValueFor(varKey, scenario, cc) {
    switch (varKey) {
      case 'wacc': return scenario.waccOverride != null ? scenario.waccOverride : cc.wacc;
      case 'terminalGrowth': return scenario.assumptions.terminalGrowthRate;
      case 'revenueGrowth': return scenario.assumptions.revenueGrowthEnd;
      case 'ebitMargin': return scenario.assumptions.ebitMarginEnd;
      case 'exitMultiple': return scenario.assumptions.exitMultiple;
      default: return null;
    }
  }

  function fmtVal(varKey, v) {
    if (!Number.isFinite(v)) return '—';
    return VARS[varKey].unit === 'x' ? F.multiple(v, 2) : F.pct(v, 2);
  }

  function buildBase(scenario, state) {
    const cc = Derive.costOfCapital(state);
    return {
      assumptions: scenario.assumptions,
      wacc: scenario.waccOverride != null ? scenario.waccOverride : cc.wacc,
      costOfEquity: scenario.costOfEquityOverride != null ? scenario.costOfEquityOverride : cc.costOfEquity,
      bridge: Derive.bridge(state),
      sharesOutstanding: state.company.sharesOutstanding,
      midYear: state.settings.midYearConvention,
      valuationMode: scenario.valuationMode
    };
  }

  function renderHeatmap(mount, gridResult, currency, currentX, currentY) {
    const flat = Sensitivity.flattenGrid(gridResult);
    const gMin = Math.min(...flat), gMax = Math.max(...flat);

    const nearestIdx = (arr, v) => arr.reduce((best, val, i) => (Math.abs(val - v) < Math.abs(arr[best] - v) ? i : best), 0);
    const xIdx = Number.isFinite(currentX) ? nearestIdx(gridResult.xRange, currentX) : -1;
    const yIdx = Number.isFinite(currentY) ? nearestIdx(gridResult.yRange, currentY) : -1;

    const head = `<tr><th class="corner">${VARS[gridResult.yVar].label} \\ ${VARS[gridResult.xVar].label}</th>${gridResult.xRange.map((x) => `<th>${fmtVal(gridResult.xVar, x)}</th>`).join('')}</tr>`;
    const rows = gridResult.grid.map((row, ri) => `
      <tr>
        <td class="row-label">${fmtVal(gridResult.yVar, gridResult.yRange[ri])}</td>
        ${row.map((v, ci) => `<td style="background:${Charts.heatCellColor(v, gMin, gMax)}; color:${Charts.heatTextColor(v, gMin, gMax)};" class="${ri === yIdx && ci === xIdx ? 'current-point' : ''}">${F.price(v, currency)}</td>`).join('')}
      </tr>`).join('');

    mount.innerHTML = `<div class="heatmap-wrap"><table class="heatmap"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }

  function render(container, store) {
    const state = store.get();

    if (state.scenarios.length === 0) {
      container.innerHTML = `
        <div class="section-head"><span class="section-eyebrow">06 — Sensitivity</span><h1>The Gimbal</h1></div>
        <div class="callout">No scenarios defined yet — head back to Step 04 to add at least one case.</div>`;
      return;
    }

    const sens = state.sensitivity;
    if (!sens.scenarioId || !state.scenarios.find((s) => s.id === sens.scenarioId)) {
      store.mutateQuiet((s) => { s.sensitivity.scenarioId = s.scenarios[0].id; });
    }
    const scenario = store.get().scenarios.find((s) => s.id === store.get().sensitivity.scenarioId);
    const cc = Derive.costOfCapital(state);

    if (sens.thirdValue == null) {
      store.mutateQuiet((s) => { s.sensitivity.thirdValue = currentValueFor(s.sensitivity.thirdVar, scenario, cc); });
    }

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">06 — Sensitivity</span>
        <h1>The Gimbal</h1>
        <p class="section-dek">Two axes as a heatmap, a third as a live dial that reshapes the whole surface. Spin any of the three; the implied price per share updates in real time.</p>
      </div>

      <div class="card">
        <div class="card-title">Scenario &amp; grid axes</div>
        <div class="grid-3">
          <div class="field">
            <label>Base scenario</label>
            <select id="grid-scenario">${state.scenarios.map((s) => `<option value="${s.id}" ${s.id === scenario.id ? 'selected' : ''}>${H.escapeHtml(s.name)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>X axis</label>
            <select id="grid-xvar">${Object.keys(VARS).map((k) => `<option value="${k}" ${k === sens.xVar ? 'selected' : ''}>${VARS[k].label}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Y axis</label>
            <select id="grid-yvar">${Object.keys(VARS).map((k) => `<option value="${k}" ${k === sens.yVar ? 'selected' : ''}>${VARS[k].label}</option>`).join('')}</select>
          </div>
        </div>
        <div class="grid-2">
          <div class="grid-3 gap-8">
            <div class="field"><label>X min</label><input type="number" id="x-min" class="mono" step="${VARS[sens.xVar].unit === 'x' ? 0.5 : 0.1}"></div>
            <div class="field"><label>X max</label><input type="number" id="x-max" class="mono" step="${VARS[sens.xVar].unit === 'x' ? 0.5 : 0.1}"></div>
            <div class="field"><label>X step</label><input type="number" id="x-step" class="mono" step="0.05"></div>
          </div>
          <div class="grid-3 gap-8">
            <div class="field"><label>Y min</label><input type="number" id="y-min" class="mono" step="${VARS[sens.yVar].unit === 'x' ? 0.5 : 0.1}"></div>
            <div class="field"><label>Y max</label><input type="number" id="y-max" class="mono" step="${VARS[sens.yVar].unit === 'x' ? 0.5 : 0.1}"></div>
            <div class="field"><label>Y step</label><input type="number" id="y-step" class="mono" step="0.05"></div>
          </div>
        </div>
        <div class="field-note">Ranges are entered in natural units — percent for rates/growth/margin, "×" for multiples.</div>
      </div>

      <div class="card">
        <div class="card-title">Live dials</div>
        <div class="grid-3">
          <div class="dial">
            <div class="dial-head"><span class="dial-label">${VARS[sens.xVar].label} (X)</span><span class="dial-value mono" id="dial-x-val"></span></div>
            <input type="range" id="dial-x" min="${sens.xMin}" max="${sens.xMax}" step="${sens.xStep}">
          </div>
          <div class="dial">
            <div class="dial-head"><span class="dial-label">${VARS[sens.yVar].label} (Y)</span><span class="dial-value mono" id="dial-y-val"></span></div>
            <input type="range" id="dial-y" min="${sens.yMin}" max="${sens.yMax}" step="${sens.yStep}">
          </div>
          <div class="dial">
            <div class="dial-head">
              <select id="third-var-select" style="border:none; background:transparent; font-family:var(--font-mono); font-size:10.5px; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-faint); padding:0;">
                ${Object.keys(VARS).filter((k) => k !== sens.xVar && k !== sens.yVar).map((k) => `<option value="${k}" ${k === sens.thirdVar ? 'selected' : ''}>${VARS[k].label}</option>`).join('')}
              </select>
              <span class="dial-value mono" id="dial-z-val"></span>
            </div>
            <input type="range" id="dial-z" min="0" max="1" step="0.01">
          </div>
        </div>
        <div class="stat-row mt-16">
          <div class="stat">
            <div class="stat-label">Implied price / share at dial position</div>
            <div class="stat-value oxblood" id="dial-price" style="font-size:38px;"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Sensitivity grid<span class="hint">outlined cell = current dial position</span></div>
        <div id="heatmap-mount"></div>
      </div>
    `;

    function recompute() {
      const st = store.get();
      const sc = st.scenarios.find((s) => s.id === st.sensitivity.scenarioId);
      if (!sc) return;
      const s = st.sensitivity;
      let base = buildBase(sc, st);

      if (!Number.isFinite(base.wacc) && sc.valuationMode === 'FCFF') {
        H.$(container, '#heatmap-mount').innerHTML = '<div class="callout danger">WACC unavailable — complete Step 03 or set a scenario override.</div>';
        return;
      }

      base = Sensitivity.applyVariable(base, s.thirdVar, s.thirdValue);

      const xRange = Utils.range(s.xMin, s.xMax, s.xStep);
      const yRange = Utils.range(s.yMin, s.yMax, s.yStep);
      const grid = Sensitivity.buildGrid(base, s.xVar, xRange, s.yVar, yRange);

      renderHeatmap(H.$(container, '#heatmap-mount'), grid, st.company.currency, H.$(container, '#dial-x').valueAsNumber, H.$(container, '#dial-y').valueAsNumber);

      const dialCtx = Sensitivity.applyVariable(Sensitivity.applyVariable(base, s.xVar, parseFloat(H.$(container, '#dial-x').value)), s.yVar, parseFloat(H.$(container, '#dial-y').value));
      let priceVal = null;
      try {
        if (sc.valuationMode === 'FCFE') {
          priceVal = root.Fulcrum.DCF.runFCFEValuation(dialCtx.assumptions, dialCtx.costOfEquity, st.company.sharesOutstanding, st.settings.midYearConvention).pricePerShare;
        } else {
          priceVal = root.Fulcrum.DCF.runFCFFValuation(dialCtx.assumptions, dialCtx.wacc, base.bridge, st.company.sharesOutstanding, st.settings.midYearConvention).pricePerShare;
        }
      } catch (e) { /* leave null */ }
      H.$(container, '#dial-price').textContent = F.price(priceVal, st.company.currency);
    }

    function syncDialLabels() {
      const s = store.get().sensitivity;
      H.$(container, '#dial-x-val').textContent = fmtVal(s.xVar, parseFloat(H.$(container, '#dial-x').value));
      H.$(container, '#dial-y-val').textContent = fmtVal(s.yVar, parseFloat(H.$(container, '#dial-y').value));
      H.$(container, '#dial-z-val').textContent = fmtVal(s.thirdVar, parseFloat(H.$(container, '#dial-z').value));
    }

    H.$(container, '#grid-scenario').addEventListener('change', (e) => store.patch('sensitivity.scenarioId', e.target.value));
    H.$(container, '#grid-xvar').addEventListener('change', (e) => {
      store.mutate((st) => {
        if (e.target.value === st.sensitivity.yVar) { st.sensitivity.yVar = st.sensitivity.xVar; }
        st.sensitivity.xVar = e.target.value;
        if (st.sensitivity.thirdVar === st.sensitivity.xVar) {
          st.sensitivity.thirdVar = Object.keys(VARS).find((k) => k !== st.sensitivity.xVar && k !== st.sensitivity.yVar);
        }
      });
    });
    H.$(container, '#grid-yvar').addEventListener('change', (e) => {
      store.mutate((st) => {
        if (e.target.value === st.sensitivity.xVar) { st.sensitivity.xVar = st.sensitivity.yVar; }
        st.sensitivity.yVar = e.target.value;
        if (st.sensitivity.thirdVar === st.sensitivity.yVar) {
          st.sensitivity.thirdVar = Object.keys(VARS).find((k) => k !== st.sensitivity.xVar && k !== st.sensitivity.yVar);
        }
      });
    });
    H.$(container, '#third-var-select').addEventListener('change', (e) => {
      store.mutate((st) => {
        st.sensitivity.thirdVar = e.target.value;
        st.sensitivity.thirdValue = currentValueFor(e.target.value, st.scenarios.find((s) => s.id === st.sensitivity.scenarioId), Derive.costOfCapital(st));
      });
    });

    ['x-min', 'x-max', 'x-step'].forEach((id, i) => {
      const key = ['xMin', 'xMax', 'xStep'][i];
      H.$(container, `#${id}`).value = sens[key];
      H.$(container, `#${id}`).addEventListener('change', (e) => {
        store.mutateQuiet((st) => { st.sensitivity[key] = parseFloat(e.target.value); });
        H.$(container, '#dial-x').min = store.get().sensitivity.xMin;
        H.$(container, '#dial-x').max = store.get().sensitivity.xMax;
        H.$(container, '#dial-x').step = store.get().sensitivity.xStep;
        recompute(); syncDialLabels();
      });
    });
    ['y-min', 'y-max', 'y-step'].forEach((id, i) => {
      const key = ['yMin', 'yMax', 'yStep'][i];
      H.$(container, `#${id}`).value = sens[key];
      H.$(container, `#${id}`).addEventListener('change', (e) => {
        store.mutateQuiet((st) => { st.sensitivity[key] = parseFloat(e.target.value); });
        H.$(container, '#dial-y').min = store.get().sensitivity.yMin;
        H.$(container, '#dial-y').max = store.get().sensitivity.yMax;
        H.$(container, '#dial-y').step = store.get().sensitivity.yStep;
        recompute(); syncDialLabels();
      });
    });

    const dx = H.$(container, '#dial-x'), dy = H.$(container, '#dial-y'), dz = H.$(container, '#dial-z');
    dx.value = Number.isFinite(currentValueFor(sens.xVar, scenario, cc)) ? currentValueFor(sens.xVar, scenario, cc) : (sens.xMin + sens.xMax) / 2;
    dy.value = Number.isFinite(currentValueFor(sens.yVar, scenario, cc)) ? currentValueFor(sens.yVar, scenario, cc) : (sens.yMin + sens.yMax) / 2;

    const zVal = sens.thirdValue;
    const zSpan = Math.abs(zVal || 0.05) * 1.5 || 0.05;
    dz.min = (zVal || 0) - zSpan; dz.max = (zVal || 0) + zSpan; dz.step = VARS[sens.thirdVar].step / 100;
    dz.value = zVal;

    [dx, dy, dz].forEach((el) => el.addEventListener('input', () => {
      store.mutateQuiet((st) => { st.sensitivity.thirdValue = parseFloat(dz.value); });
      syncDialLabels();
      recompute();
    }));

    syncDialLabels();
    recompute();
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Sensitivity = { render };
})(window);
