(function (root) {
  const H = root.Fulcrum.UIHelpers;

  function render(container, store) {
    const s = store.get();
    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">01 — Setup</span>
        <h1>Company &amp; Case</h1>
        <p class="section-dek">The subject company and the mechanics that turn a valuation into a per-share number. Everything downstream references this.</p>
      </div>

      <div class="card">
        <div class="card-title">Identity</div>
        <div class="grid-3">
          <div class="field">
            <label>Company name</label>
            <input type="text" id="f-name" placeholder="e.g. Meridian Instruments, Inc.">
          </div>
          <div class="field">
            <label>Ticker</label>
            <input type="text" id="f-ticker" class="mono" placeholder="MRDN">
          </div>
          <div class="field">
            <label>Reporting currency</label>
            <select id="f-currency">
              ${['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'AUD', 'CAD'].map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Share count &amp; market reference<span class="hint">used to convert equity value into a price per share</span></div>
        <div class="grid-3">
          <div class="field">
            <label>Diluted shares outstanding (mm)</label>
            <input type="number" id="f-shares" class="mono" step="0.1">
          </div>
          <div class="field">
            <label>Current market price <span class="muted">(optional — for comparison)</span></label>
            <input type="number" id="f-price" class="mono" step="0.01">
          </div>
          <div class="field">
            <label>Valuation date</label>
            <input type="date" id="f-date">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Modeling conventions</div>
        <div class="grid-2">
          <div class="field">
            <label class="flex gap-8" style="align-items:center;"><input type="checkbox" id="f-midyear" style="width:auto;"> Mid-year discounting convention</label>
            <div class="field-note">Assumes cash arrives evenly through the year rather than in a lump at year-end — Damodaran's standard adjustment; typically lifts value ~WACC/2 vs. year-end discounting.</div>
          </div>
          <div class="field">
            <label>Primary headline approach</label>
            <select id="f-primary-approach">
              <option value="FCFF">Firm value (FCFF → subtract net debt)</option>
              <option value="FCFE">Equity value (FCFE, direct)</option>
            </select>
            <div class="field-note">Both routes are always computed and reconciled — this only picks which one leads the summary.</div>
          </div>
        </div>
      </div>

      <div class="callout">
        <span class="callout-title">Note</span>
        Nothing here is fetched or inferred — every figure on this page (and every page after it) comes from what you type in. New to FULCRUM? Load the sample case from the sidebar to see a fully wired illustrative example first.
      </div>
    `;

    H.bindText(container, '#f-name', store, 'company.name');
    H.bindText(container, '#f-ticker', store, 'company.ticker');
    H.bindSelect(container, '#f-currency', store, 'company.currency');
    H.bindNumber(container, '#f-shares', store, 'company.sharesOutstanding');
    H.bindNumber(container, '#f-price', store, 'company.currentPrice');

    const dateEl = H.$(container, '#f-date');
    dateEl.value = s.company.valuationDate || '';
    dateEl.addEventListener('change', () => store.patchQuiet('company.valuationDate', dateEl.value));

    H.bindCheckbox(container, '#f-midyear', store, 'settings.midYearConvention');
    H.bindSelect(container, '#f-primary-approach', store, 'settings.valuationApproachPrimary');
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Company = { render };
})(window);
