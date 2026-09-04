(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const F = root.Fulcrum.Format;

  let activeTab = 'income';

  const SECTIONS = {
    income: {
      title: 'Income Statement',
      group: 'income',
      rows: [
        { key: 'revenue', label: 'Revenue' },
        { key: 'cogs', label: 'Cost of goods sold' },
        { key: 'sgna', label: 'SG&A' },
        { key: 'da', label: 'D&A (in COGS/opex)' },
        { key: 'ebit', label: 'EBIT', emphasize: true },
        { key: 'interestExpense', label: 'Interest expense' },
        { key: 'taxExpense', label: 'Income tax expense' },
        { key: 'netIncome', label: 'Net income', total: true }
      ]
    },
    balance: {
      title: 'Balance Sheet',
      group: 'balance',
      rows: [
        { key: 'cash', label: 'Cash & equivalents' },
        { key: 'shortTermDebt', label: 'Short-term debt' },
        { key: 'longTermDebt', label: 'Long-term debt' },
        { key: 'minorityInterest', label: 'Minority interest' },
        { key: 'preferredStock', label: 'Preferred stock' },
        { key: 'totalEquity', label: 'Total shareholders\' equity', total: true }
      ]
    },
    cashflow: {
      title: 'Cash Flow Statement',
      group: 'cashflow',
      rows: [
        { key: 'da', label: 'D&A (add-back)' },
        { key: 'capex', label: 'Capital expenditures' },
        { key: 'nwcChange', label: 'Increase in net working capital' },
        { key: 'netBorrowing', label: 'Net borrowing (repayment negative)' }
      ]
    }
  };

  function ensureArrayLengths(state) {
    const n = state.statements.years.length;
    ['income', 'balance', 'cashflow'].forEach((g) => {
      Object.keys(state.statements[g]).forEach((k) => {
        const arr = state.statements[g][k];
        while (arr.length < n) arr.push(null);
        while (arr.length > n) arr.pop();
      });
    });
  }

  function addYear(store) {
    store.mutate((state) => {
      const n = state.statements.years.length;
      const nextLabel = n === 0 ? 'FY1' : `FY${n + 1}`;
      state.statements.years.push(nextLabel);
      ensureArrayLengths(state);
    });
  }

  function removeYear(store, idx) {
    store.mutate((state) => {
      state.statements.years.splice(idx, 1);
      ['income', 'balance', 'cashflow'].forEach((g) => {
        Object.keys(state.statements[g]).forEach((k) => state.statements[g][k].splice(idx, 1));
      });
    });
  }

  function renderTable(container, store, sectionKey) {
    const section = SECTIONS[sectionKey];
    const state = store.get();
    const years = state.statements.years;
    const data = state.statements[section.group];

    let headRow = `<tr><th style="min-width:190px;">${section.title}</th>${years.map((y, i) => `
      <th>
        <div class="flex" style="justify-content:flex-end; align-items:center; gap:6px;">
          <span class="year-label" data-idx="${i}" contenteditable="true" style="outline:none; cursor:text;">${H.escapeHtml(y)}</span>
          <button class="icon-btn remove-year" data-idx="${i}" title="Remove this year" style="font-size:11px;">✕</button>
        </div>
      </th>`).join('')}</tr>`;

    let bodyRows = section.rows.map((row) => {
      const cells = years.map((_, i) => `
        <td><input type="number" class="mono cell-input" data-group="${section.group}" data-key="${row.key}" data-idx="${i}"
              value="${data[row.key][i] ?? ''}" step="0.1"></td>
      `).join('');
      return `<tr class="${row.total ? 'total' : ''}"><td>${row.label}</td>${cells}</tr>`;
    }).join('');

    let extraRow = '';
    if (sectionKey === 'balance') {
      const totalDebt = years.map((_, i) => (data.shortTermDebt[i] || 0) + (data.longTermDebt[i] || 0));
      extraRow = `<tr class="total"><td>Total debt (ST + LT)</td>${totalDebt.map((v) => `<td class="mono">${F.num(v, 1)}</td>`).join('')}</tr>`;
    }

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ledger">
          <thead>${headRow}</thead>
          <tbody>${bodyRows}${extraRow}</tbody>
        </table>
      </div>
      <div class="mt-16"><button class="btn btn-ghost btn-sm" id="add-year-btn">+ Add fiscal year</button></div>
    `;

    H.$all(container, '.cell-input').forEach((input) => {
      input.addEventListener('input', () => {
        const g = input.dataset.group, k = input.dataset.key, idx = parseInt(input.dataset.idx, 10);
        const val = input.value === '' ? null : parseFloat(input.value);
        store.mutateQuiet((s) => { s.statements[g][k][idx] = val; });
        if (sectionKey === 'balance' && (k === 'shortTermDebt' || k === 'longTermDebt')) {
          renderTable(container, store, sectionKey); // refresh computed total-debt row
        }
      });
    });

    H.$all(container, '.remove-year').forEach((btn) => {
      btn.addEventListener('click', () => removeYear(store, parseInt(btn.dataset.idx, 10)));
    });

    H.$all(container, '.year-label').forEach((span) => {
      span.addEventListener('blur', () => {
        const idx = parseInt(span.dataset.idx, 10);
        store.mutateQuiet((s) => { s.statements.years[idx] = span.textContent.trim() || `FY${idx + 1}`; });
      });
    });

    const addBtn = H.$(container, '#add-year-btn');
    if (addBtn) addBtn.addEventListener('click', () => { addYear(store); renderTable(container, store, sectionKey); });
  }

  function render(container, store) {
    const state = store.get();
    if (state.statements.years.length === 0) {
      // seed with three blank years so the table isn't a confusing 0-column grid
      store.mutateQuiet((s) => { s.statements.years = ['FY1', 'FY2', 'FY3']; ensureArrayLengths(s); });
    } else {
      ensureArrayLengths(state);
    }

    container.innerHTML = `
      <div class="section-head">
        <span class="section-eyebrow">02 — Historicals</span>
        <h1>Financial Statements</h1>
        <p class="section-dek">Transcribe the last several fiscal years exactly as reported. These actuals anchor the base-year figures every scenario projects forward from.</p>
      </div>

      <div class="card">
        <div class="tabbar">
          <button data-tab="income" class="${activeTab === 'income' ? 'active' : ''}">Income Statement</button>
          <button data-tab="balance" class="${activeTab === 'balance' ? 'active' : ''}">Balance Sheet</button>
          <button data-tab="cashflow" class="${activeTab === 'cashflow' ? 'active' : ''}">Cash Flow</button>
        </div>
        <div id="stmt-table-mount"></div>
      </div>

      <div class="callout">
        <span class="callout-title">Units</span>
        Enter every figure in the same units (millions is typical) — FULCRUM doesn't rescale between statements. The most recent column is treated as the base year for scenario projections in Step 04.
      </div>
    `;

    H.$all(container, '.tabbar button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render(container, store);
      });
    });

    renderTable(H.$(container, '#stmt-table-mount'), store, activeTab);
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.Statements = { render };
})(window);
