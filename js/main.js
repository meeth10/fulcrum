(function () {
  const Fulcrum = window.Fulcrum;
  const H = Fulcrum.UIHelpers;
  const Derive = Fulcrum.Derive;
  const Utils = Fulcrum.Utils;

  const STEPS = [
    { key: 'company', num: '01', label: 'Company & Case', view: () => Fulcrum.UI.Company },
    { key: 'statements', num: '02', label: 'Financial Statements', view: () => Fulcrum.UI.Statements },
    { key: 'capital', num: '03', label: 'Cost of Capital', view: () => Fulcrum.UI.Capital },
    { key: 'scenarios', num: '04', label: 'Scenarios & Assumptions', view: () => Fulcrum.UI.Scenarios },
    { key: 'valuation', num: '05', label: 'Valuation Output', view: () => Fulcrum.UI.Valuation },
    { key: 'sensitivity', num: '06', label: 'The Gimbal', view: () => Fulcrum.UI.Sensitivity },
    { key: 'summary', num: '07', label: 'Summary & Football Field', view: () => Fulcrum.UI.Summary }
  ];

  let activeStepKey = 'company';
  let store = null;

  function computeWarnings(state) {
    const warnings = new Set();
    if (!Number.isFinite(state.company.sharesOutstanding) || state.company.sharesOutstanding <= 0) warnings.add('company');
    if (state.statements.years.length === 0) warnings.add('statements');

    const cc = Derive.costOfCapital(state);
    if (!Number.isFinite(cc.wacc)) warnings.add('capital');

    if (state.scenarios.length === 0) {
      warnings.add('scenarios');
    } else {
      const total = Utils.sum(state.scenarios.map((s) => s.probability));
      if (Math.abs(total - 1) > 0.005) warnings.add('scenarios');
      state.scenarios.forEach((s) => {
        const wacc = s.waccOverride != null ? s.waccOverride : cc.wacc;
        if (s.assumptions.terminalMethod === 'gordon' && Number.isFinite(wacc) && wacc <= s.assumptions.terminalGrowthRate) {
          warnings.add('valuation');
        }
      });
    }
    return warnings;
  }

  function renderSidebarNav() {
    const state = store.get();
    const warnings = computeWarnings(state);
    const nav = document.getElementById('step-nav');
    nav.innerHTML = STEPS.map((s) => `
      <button class="step-link ${s.key === activeStepKey ? 'active' : ''} ${warnings.has(s.key) ? 'has-warning' : ''}" data-key="${s.key}">
        <span class="num">${s.num}</span><span>${s.label}</span><span class="flag"></span>
      </button>
    `).join('');
    H.$all(nav, '.step-link').forEach((btn) => btn.addEventListener('click', () => setStep(btn.dataset.key)));
  }

  function renderCaseName() {
    const input = document.getElementById('case-name-input');
    const state = store.get();
    if (document.activeElement !== input) input.value = state.meta.caseName || '';
  }

  function renderMain() {
    const mount = document.getElementById('main-content');
    const step = STEPS.find((s) => s.key === activeStepKey);
    step.view().render(mount, store);
  }

  function setStep(key) {
    activeStepKey = key;
    renderSidebarNav();
    renderMain();
    const mount = document.getElementById('main-content');
    if (typeof mount.scrollTo === 'function') mount.scrollTo({ top: 0, behavior: 'auto' });
    else mount.scrollTop = 0;
  }

  function fullRender() {
    renderSidebarNav();
    renderCaseName();
    renderMain();
    Fulcrum.UI.SyncModal.updateSyncStatusPill();
  }

  function exportJson() {
    const state = store.get();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (state.meta.caseName || 'fulcrum-case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.href = url; a.download = `${slug || 'fulcrum-case'}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function init() {
    store = Fulcrum.State.makeStore();

    store.subscribe(() => {
      renderSidebarNav();
      renderMain();
    });

    document.getElementById('case-name-input').addEventListener('input', (e) => {
      store.patchQuiet('meta.caseName', e.target.value);
    });

    document.getElementById('btn-load-sample').addEventListener('click', () => {
      if (confirm('Load the illustrative sample case? This replaces everything currently entered.')) {
        store.set(Fulcrum.SampleCase());
        activeStepKey = 'company';
        fullRender();
      }
    });

    document.getElementById('btn-github').addEventListener('click', () => Fulcrum.UI.SyncModal.openModal(store));
    document.getElementById('btn-export').addEventListener('click', exportJson);

    fullRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
