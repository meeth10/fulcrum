(function (root) {
  const H = root.Fulcrum.UIHelpers;
  const GH = root.Fulcrum.GitHubSync;

  let lastLoadedSha = null;
  let statusMsg = '';
  let statusKind = 'muted'; // 'muted' | 'danger' | 'forest'

  function slug(name) {
    return (name || 'untitled-case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '.json';
  }

  function updateSyncStatusPill() {
    const pill = document.getElementById('sync-status');
    if (!pill) return;
    if (GH.hasToken()) {
      pill.classList.add('connected');
      pill.querySelector('span:last-child').textContent = 'Connected';
    } else {
      pill.classList.remove('connected');
      pill.querySelector('span:last-child').textContent = 'Not connected';
    }
  }

  async function renderBody(store) {
    const modalBody = document.getElementById('github-modal-body');
    const state = store.get();
    const gh = state.github;

    modalBody.innerHTML = `
      <div class="card-title">GitHub save / load<button class="icon-btn" id="gh-close" style="font-size:16px;">✕</button></div>

      <div class="grid-2">
        <div class="field"><label>Owner</label><input type="text" id="gh-owner" value="${H.escapeHtml(gh.owner)}" placeholder="your-username"></div>
        <div class="field"><label>Repo</label><input type="text" id="gh-repo" value="${H.escapeHtml(gh.repo)}" placeholder="fulcrum-cases"></div>
        <div class="field"><label>Path</label><input type="text" id="gh-path" value="${H.escapeHtml(gh.path)}" placeholder="cases"></div>
        <div class="field"><label>Branch</label><input type="text" id="gh-branch" value="${H.escapeHtml(gh.branch)}" placeholder="main"></div>
      </div>
      <div class="field">
        <label>Personal access token <span class="muted">(session only — never saved to disk)</span></label>
        <input type="password" id="gh-token" placeholder="${GH.hasToken() ? '•••••••••••• (already set this session)' : 'github_pat_...'}">
        <div class="field-note">Fine-grained PAT with Contents read/write on this repo, or a classic token with <code>repo</code> scope.</div>
      </div>

      <div class="flex gap-8 mt-8">
        <button class="btn btn-sm" id="gh-list">Refresh case list</button>
        <button class="btn btn-primary btn-sm" id="gh-save">Save current case</button>
      </div>

      <div id="gh-status" class="field-note mt-8" style="color:${statusKind === 'danger' ? 'var(--danger)' : statusKind === 'forest' ? 'var(--forest)' : 'var(--ink-faint)'};">${statusMsg}</div>

      <div id="gh-file-list" class="mt-16"></div>
    `;

    document.getElementById('gh-close').addEventListener('click', closeModal);
    document.getElementById('gh-owner').addEventListener('input', (e) => store.patchQuiet('github.owner', e.target.value));
    document.getElementById('gh-repo').addEventListener('input', (e) => store.patchQuiet('github.repo', e.target.value));
    document.getElementById('gh-path').addEventListener('input', (e) => store.patchQuiet('github.path', e.target.value));
    document.getElementById('gh-branch').addEventListener('input', (e) => store.patchQuiet('github.branch', e.target.value));
    document.getElementById('gh-token').addEventListener('input', (e) => { if (e.target.value) GH.setToken(e.target.value); });

    document.getElementById('gh-list').addEventListener('click', () => refreshList(store));
    document.getElementById('gh-save').addEventListener('click', () => saveCurrent(store));
  }

  async function refreshList(store) {
    statusMsg = 'Loading case list…'; statusKind = 'muted';
    await renderBody(store);
    try {
      const files = await GH.listCases(store.get().github);
      const listEl = document.getElementById('gh-file-list');
      if (!files.length) {
        listEl.innerHTML = '<div class="muted small">No saved cases in this repo/path yet.</div>';
      } else {
        listEl.innerHTML = `
          <table class="ledger"><tbody>
            ${files.map((f) => `<tr><td>${H.escapeHtml(f.name)}</td><td style="text-align:right;"><button class="btn btn-ghost btn-sm gh-load-btn" data-name="${H.escapeHtml(f.name)}">Load</button></td></tr>`).join('')}
          </tbody></table>`;
        H.$all(listEl, '.gh-load-btn').forEach((btn) => btn.addEventListener('click', () => loadFile(store, btn.dataset.name)));
      }
      statusMsg = `Connected — ${files.length} case(s) found.`; statusKind = 'forest';
    } catch (e) {
      statusMsg = e.message; statusKind = 'danger';
    }
    updateSyncStatusPill();
    await renderBody(store);
  }

  async function loadFile(store, filename) {
    statusMsg = `Loading ${filename}…`; statusKind = 'muted';
    await renderBody(store);
    try {
      const { state: loadedState, sha } = await GH.loadCase(store.get().github, filename);
      lastLoadedSha = sha;
      // Preserve the current github connection block (owner/repo/path/branch) rather than overwrite from the file.
      loadedState.github = store.get().github;
      store.set(loadedState);
      statusMsg = `Loaded "${filename}".`; statusKind = 'forest';
    } catch (e) {
      statusMsg = e.message; statusKind = 'danger';
    }
    await renderBody(store);
  }

  async function saveCurrent(store) {
    const state = store.get();
    const filename = slug(state.meta.caseName);
    statusMsg = `Saving ${filename}…`; statusKind = 'muted';
    await renderBody(store);
    try {
      await GH.saveCase(state.github, filename, state, lastLoadedSha);
      statusMsg = `Saved "${filename}".`; statusKind = 'forest';
    } catch (e) {
      statusMsg = e.message.includes('422') ? `${e.message} — a file with this name may already exist; use Refresh, Load it, then Save to update it.` : e.message;
      statusKind = 'danger';
    }
    await renderBody(store);
  }

  function openModal(store) {
    document.getElementById('github-modal').classList.remove('hidden');
    statusMsg = GH.hasToken() ? '' : 'Enter a token, then Refresh case list.';
    statusKind = 'muted';
    renderBody(store);
  }

  function closeModal() {
    document.getElementById('github-modal').classList.add('hidden');
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UI = root.Fulcrum.UI || {};
  root.Fulcrum.UI.SyncModal = { openModal, closeModal, updateSyncStatusPill };
})(window);
