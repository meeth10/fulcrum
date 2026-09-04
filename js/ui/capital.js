(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;
  const WACC = root.Fulcrum.WACC;
  const Derive = root.Fulcrum.Derive;

  function compRow(comp, idx) {
    return `
      <tr data-idx="${idx}">
        <td><input type="text" class="comp-name" data-idx="${idx}" value="${H.escapeHtml(comp.name || '')}" placeholder="Comp name" style="font-family:var(--font-body);"></td>
        <td><input type="number" class="mono comp-beta" data-idx="${idx}" value="${comp.beta ?? ''}" step="0.01"></td>
        <td><input type="number" class="mono comp-de" data-idx="${idx}" value="${comp.de != null ? (comp.de * 100).toFixed(1) : ''}" step="0.1"></td>
        <td><input type="number" class="mono comp-tax" data-idx="${idx}" value="${comp.taxRate != null ? (comp.taxRate * 100).toFixed(1) : ''}" step="0.1"></td>
        <td><button class="icon-btn comp-remove" data-idx="${idx}">✕</button></td>
      </tr>`;
  }

  function renderOutputs(container, store) {
    const cc = Derive.costOfCapital(store.get());
    const mount = H.$(container, '#cc-outputs');
    mount.innerHTML = `
      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">Cost of equity</div>
          <div class="stat-value oxblood">${F.pct(cc.costOfEquity, 2)}</div>
          <div class="stat-sub">β ${F.num(cc.beta, 3)} · CAPM</div>
        </div>
        <div class="stat">
          <div class="stat-label">Cost of debt (pretax)</div>
          <div class="stat-value">${F.pct(cc.costOfDebtPretax, 2)}</div>
          <div class="stat-sub">${cc.costOfDebtRating ? `synthetic rating ${cc.costOfDebtRating} · +${F.pct(cc.costOfDebtSpread, 2)} spread` : 'direct input'}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Capital weights (E / D)</div>
          <div class="stat-value">${cc.weightEquity != null ? F.pct(cc.weightEquity, 0) : '—'} <span class="unit">/ ${cc.weightEquity != null ? F.pct(1 - cc.weightEquity, 0) : '—'}</span></div>
          <div class="stat-sub">MV equity ${F.money(cc.marketValueEquity)} · MV debt ${F.money(cc.marketValueDebt)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">WACC</div>
          <div class="stat-value forest">${cc.wacc != null ? F.pct(cc.wacc, 2) : '—'}</div>
          <div class="stat-sub">${cc.wacc == null ? 'needs market value of equity & debt' : 'discount rate for FCFF'}</div>
        </div>
      </div>
    `;
  }

  function render(container, store) {
    const s = store.get();
    const cc = s.costOfCapital;

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">03 — Cost of Capital</span>
        <h1>WACC &amp; Discount Rates</h1>
        <p class="section-dek">Bottom-up beta the Damodaran way: unlever each comp at its own structure, average, relever at your target. Cost of debt from a direct rate or a synthetic rating off interest coverage.</p>
      </div>

      <div class="card">
        <div class="card-title">Live output</div>
        <div id="cc-outputs"></div>
      </div>

      <div class="card">
        <div class="card-title">CAPM inputs</div>
        <div class="grid-4">
          <div class="field"><label>Risk-free rate</label><div class="pct-input"><input type="number" id="rf" class="mono" step="0.05"></div></div>
          <div class="field"><label>Equity risk premium</label><div class="pct-input"><input type="number" id="erp" class="mono" step="0.05"></div></div>
          <div class="field"><label>Size premium</label><div class="pct-input"><input type="number" id="size" class="mono" step="0.05"></div></div>
          <div class="field"><label>Country risk premium</label><div class="pct-input"><input type="number" id="crp" class="mono" step="0.05"></div></div>
        </div>
        <div class="field-note">Use the current long-term government bond yield for the risk-free rate, and Damodaran's published implied ERP (updated monthly on his site) rather than a stale textbook 5%.</div>
      </div>

      <div class="card">
        <div class="card-title">Beta<span class="hint">bottom-up (comps) or a direct regression beta</span></div>
        <div class="field" style="max-width:280px;">
          <label>Method</label>
          <select id="beta-mode">
            <option value="bottomUp">Bottom-up from comps</option>
            <option value="direct">Direct input</option>
          </select>
        </div>

        <div id="beta-direct-wrap" class="${cc.betaMode === 'direct' ? '' : 'hidden'}">
          <div class="field" style="max-width:200px;"><label>Levered beta</label><input type="number" id="direct-beta" class="mono" step="0.01"></div>
        </div>

        <div id="beta-bottomup-wrap" class="${cc.betaMode === 'bottomUp' ? '' : 'hidden'}">
          <table class="ledger mt-8">
            <thead><tr><th style="text-align:left;">Comparable</th><th>Beta</th><th>D/E (%)</th><th>Tax rate (%)</th><th></th></tr></thead>
            <tbody id="comp-rows">${cc.comps.map(compRow).join('')}</tbody>
          </table>
          <button class="btn btn-ghost btn-sm mt-8" id="add-comp">+ Add comparable</button>
          <div class="grid-2 mt-16">
            <div class="field"><label>Target D/E (subject company)</label><div class="pct-input"><input type="number" id="target-de" class="mono" step="1"></div></div>
            <div class="field"><label>Target tax rate (for relevering)</label><div class="pct-input"><input type="number" id="target-tax-relever" class="mono" step="0.5"></div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Cost of debt</div>
        <div class="field" style="max-width:280px;">
          <label>Method</label>
          <select id="kd-mode">
            <option value="direct">Direct pretax rate</option>
            <option value="synthetic">Synthetic rating (interest coverage)</option>
          </select>
        </div>
        <div id="kd-direct-wrap" class="${cc.costOfDebtMethod === 'direct' ? '' : 'hidden'}">
          <div class="field" style="max-width:200px;"><label>Pretax cost of debt</label><div class="pct-input"><input type="number" id="direct-kd" class="mono" step="0.05"></div></div>
        </div>
        <div id="kd-synthetic-wrap" class="${cc.costOfDebtMethod === 'synthetic' ? '' : 'hidden'}">
          <div class="field" style="max-width:220px;"><label>Interest coverage (EBIT / Interest)</label><input type="number" id="icr" class="mono" step="0.1"></div>
          <div class="field-note">Bands mirror the shape of Damodaran's published table — the spread VALUES are illustrative placeholders. Replace with his current table (NYU Stern site) before relying on this for live work.</div>
        </div>
        <div class="field mt-16" style="max-width:200px;"><label>Marginal tax rate</label><div class="pct-input"><input type="number" id="tax-rate" class="mono" step="0.5"></div></div>
      </div>

      <div class="card">
        <div class="card-title">Market value weights<span class="hint">blank = derived from price×shares and latest balance-sheet debt</span></div>
        <div class="grid-2">
          <div class="field"><label>Market value of equity</label><input type="number" id="mv-equity" class="mono" step="1" placeholder="auto from Step 01"></div>
          <div class="field"><label>Market value of debt</label><input type="number" id="mv-debt" class="mono" step="1" placeholder="auto from Step 02"></div>
        </div>
      </div>
    `;

    renderOutputs(container, store);
    const rerenderOutputs = () => renderOutputs(container, store);

    H.bindPercent(container, '#rf', store, 'costOfCapital.riskFreeRate', { onAfter: rerenderOutputs });
    H.bindPercent(container, '#erp', store, 'costOfCapital.equityRiskPremium', { onAfter: rerenderOutputs });
    H.bindPercent(container, '#size', store, 'costOfCapital.sizePremium', { onAfter: rerenderOutputs });
    H.bindPercent(container, '#crp', store, 'costOfCapital.countryRiskPremium', { onAfter: rerenderOutputs });

    H.$(container, '#beta-mode').value = cc.betaMode;
    H.$(container, '#beta-mode').addEventListener('change', (e) => {
      store.patch('costOfCapital.betaMode', e.target.value);
    });

    H.bindNumber(container, '#direct-beta', store, 'costOfCapital.directBeta', { onAfter: rerenderOutputs });

    H.$all(container, '.comp-name').forEach((el) => el.addEventListener('input', () => {
      const i = parseInt(el.dataset.idx, 10);
      store.mutateQuiet((st) => { st.costOfCapital.comps[i].name = el.value; });
    }));
    H.$all(container, '.comp-beta').forEach((el) => el.addEventListener('input', () => {
      const i = parseInt(el.dataset.idx, 10);
      store.mutateQuiet((st) => { st.costOfCapital.comps[i].beta = el.value === '' ? null : parseFloat(el.value); });
      rerenderOutputs();
    }));
    H.$all(container, '.comp-de').forEach((el) => el.addEventListener('input', () => {
      const i = parseInt(el.dataset.idx, 10);
      store.mutateQuiet((st) => { st.costOfCapital.comps[i].de = el.value === '' ? null : parseFloat(el.value) / 100; });
      rerenderOutputs();
    }));
    H.$all(container, '.comp-tax').forEach((el) => el.addEventListener('input', () => {
      const i = parseInt(el.dataset.idx, 10);
      store.mutateQuiet((st) => { st.costOfCapital.comps[i].taxRate = el.value === '' ? null : parseFloat(el.value) / 100; });
      rerenderOutputs();
    }));
    H.$all(container, '.comp-remove').forEach((btn) => btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      store.mutate((st) => { st.costOfCapital.comps.splice(i, 1); });
    }));
    const addCompBtn = H.$(container, '#add-comp');
    if (addCompBtn) addCompBtn.addEventListener('click', () => {
      store.mutate((st) => { st.costOfCapital.comps.push({ id: root.Fulcrum.State.uid('comp'), name: '', beta: null, de: null, taxRate: st.costOfCapital.taxRate }); });
    });

    H.bindPercent(container, '#target-de', store, 'costOfCapital.targetDE', { onAfter: rerenderOutputs });
    H.bindPercent(container, '#target-tax-relever', store, 'costOfCapital.taxRate', { onAfter: rerenderOutputs });

    H.$(container, '#kd-mode').value = cc.costOfDebtMethod;
    H.$(container, '#kd-mode').addEventListener('change', (e) => store.patch('costOfCapital.costOfDebtMethod', e.target.value));

    H.bindPercent(container, '#direct-kd', store, 'costOfCapital.directCostOfDebtPretax', { onAfter: rerenderOutputs });
    H.bindNumber(container, '#icr', store, 'costOfCapital.interestCoverageRatio', { onAfter: rerenderOutputs });
    H.bindPercent(container, '#tax-rate', store, 'costOfCapital.taxRate', { onAfter: rerenderOutputs });

    H.bindNumber(container, '#mv-equity', store, 'costOfCapital.marketValueEquity', { onAfter: rerenderOutputs });
    H.bindNumber(container, '#mv-debt', store, 'costOfCapital.marketValueDebt', { onAfter: rerenderOutputs });
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Capital = { render };
})(window);
