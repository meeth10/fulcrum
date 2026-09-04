/**
 * FULCRUM — github-sync.js
 * Save/load cases as JSON files in a GitHub repo using a fine-grained
 * Personal Access Token, same pattern as FRAME.
 *
 * The token is held ONLY in memory for the session (a module-level variable) —
 * it is never written to localStorage or committed to any file. The user
 * re-enters it each session. This is a deliberate tradeoff for a tool meant
 * to be dropped into a repo and used from a shared or work machine.
 *
 * Required PAT scope: "Contents" read/write on the target repo (fine-grained),
 * or classic `repo` scope.
 */
(function (root) {
  let sessionToken = null;

  function setToken(token) { sessionToken = token || null; }
  function hasToken() { return !!sessionToken; }
  function clearToken() { sessionToken = null; }

  function apiBase(owner, repo, path) {
    return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  }

  async function request(url, options) {
    if (!sessionToken) throw new Error('No GitHub token set for this session.');
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Accept': 'application/vnd.github+json',
        ...(options && options.headers ? options.headers : {})
      }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${body || res.statusText}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /** List case files (JSON) under github.path in the repo. */
  async function listCases({ owner, repo, path, branch }) {
    const url = `${apiBase(owner, repo, path)}?ref=${encodeURIComponent(branch || 'main')}`;
    const items = await request(url, { method: 'GET' });
    if (!Array.isArray(items)) return [];
    return items.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  }

  /** Fetch and parse one case file's content. */
  async function loadCase({ owner, repo, path, branch }, filename) {
    const fullPath = `${path.replace(/\/$/, '')}/${filename}`;
    const url = `${apiBase(owner, repo, fullPath)}?ref=${encodeURIComponent(branch || 'main')}`;
    const file = await request(url, { method: 'GET' });
    const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
    return { state: JSON.parse(decoded), sha: file.sha };
  }

  /**
   * Save (create or update) a case file. If `sha` is supplied (from a prior load),
   * this updates that exact file — otherwise GitHub will reject a create-over-existing.
   */
  async function saveCase({ owner, repo, path, branch }, filename, stateObj, existingSha) {
    const fullPath = `${path.replace(/\/$/, '')}/${filename}`;
    const url = apiBase(owner, repo, fullPath);
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(stateObj, null, 2))));
    const body = {
      message: `FULCRUM: save case "${filename}"`,
      content,
      branch: branch || 'main'
    };
    if (existingSha) body.sha = existingSha;
    return request(url, { method: 'PUT', body: JSON.stringify(body) });
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.GitHubSync = { setToken, hasToken, clearToken, listCases, loadCase, saveCase };
})(window);
