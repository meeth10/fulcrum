/**
 * FULCRUM — ui/helpers.js
 * Small, boring DOM helpers shared across every view module. No framework —
 * just enough glue to keep the view files readable.
 */
(function (root) {
  const F = root.Fulcrum.Format;

  /** Query within a container, shorthand. */
  function $(container, selector) { return container.querySelector(selector); }
  function $all(container, selector) { return Array.from(container.querySelectorAll(selector)); }

  /**
   * Bind a plain-number <input> at a dotted state path with quiet patching
   * (no re-render on keystroke). onAfter(state) can update sibling derived
   * numbers on screen without a full view re-render.
   */
  function bindNumber(container, selector, store, path, opts) {
    opts = opts || {};
    const el = $(container, selector);
    if (!el) return;
    const get = opts.get || ((s) => getAtPath(s, path));
    el.value = Number.isFinite(get(store.get())) ? get(store.get()) : '';
    el.addEventListener('input', () => {
      const n = el.value === '' ? null : parseFloat(el.value);
      if (opts.set) opts.set(store, n); else store.patchQuiet(path, n);
      if (opts.onAfter) opts.onAfter(store.get());
    });
  }

  /** Same as bindNumber but the on-screen value is a percent (typed "8.5") backing a decimal (0.085) in state. */
  function bindPercent(container, selector, store, path, opts) {
    opts = opts || {};
    const el = $(container, selector);
    if (!el) return;
    const get = opts.get || ((s) => getAtPath(s, path));
    const raw = get(store.get());
    el.value = Number.isFinite(raw) ? F.decimalToPctInput(raw) : '';
    el.addEventListener('input', () => {
      const dec = el.value === '' ? null : F.pctToDecimal(el.value);
      if (opts.set) opts.set(store, dec); else store.patchQuiet(path, dec);
      if (opts.onAfter) opts.onAfter(store.get());
    });
  }

  function bindText(container, selector, store, path, opts) {
    opts = opts || {};
    const el = $(container, selector);
    if (!el) return;
    const get = opts.get || ((s) => getAtPath(s, path));
    el.value = get(store.get()) || '';
    el.addEventListener('input', () => {
      if (opts.set) opts.set(store, el.value); else store.patchQuiet(path, el.value);
      if (opts.onAfter) opts.onAfter(store.get());
    });
  }

  function bindSelect(container, selector, store, path, opts) {
    opts = opts || {};
    const el = $(container, selector);
    if (!el) return;
    const get = opts.get || ((s) => getAtPath(s, path));
    el.value = get(store.get());
    el.addEventListener('change', () => {
      if (opts.set) opts.set(store, el.value); else store.patch(path, el.value);
      if (opts.onAfter) opts.onAfter(store.get());
    });
  }

  function bindCheckbox(container, selector, store, path, opts) {
    opts = opts || {};
    const el = $(container, selector);
    if (!el) return;
    const get = opts.get || ((s) => getAtPath(s, path));
    el.checked = !!get(store.get());
    el.addEventListener('change', () => {
      if (opts.set) opts.set(store, el.checked); else store.patch(path, el.checked);
      if (opts.onAfter) opts.onAfter(store.get());
    });
  }

  function getAtPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.UIHelpers = { $, $all, bindNumber, bindPercent, bindText, bindSelect, bindCheckbox, getAtPath, escapeHtml };
})(window);
