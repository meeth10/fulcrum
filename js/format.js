/**
 * FULCRUM — format.js
 * Presentation-layer formatting only. Calculation modules never format;
 * they pass raw numbers. Keeps the math testable and the display swappable.
 */
(function (root) {
  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CNY: '¥', AUD: 'A$', CAD: 'C$' };

  function currencySymbol(code) {
    return CURRENCY_SYMBOLS[code] || (code ? code + ' ' : '$');
  }

  /** Format a raw number (already in the statement's stated units, e.g. millions) as money. */
  function money(value, currency, decimals) {
    if (!Number.isFinite(value)) return '—';
    const d = decimals === undefined ? 1 : decimals;
    const sym = currencySymbol(currency);
    const sign = value < 0 ? '(' : '';
    const close = value < 0 ? ')' : '';
    return `${sign}${sym}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${close}`;
  }

  /** Price per share — more decimal precision than aggregate money figures. */
  function price(value, currency) {
    if (!Number.isFinite(value)) return '—';
    const sym = currencySymbol(currency);
    return `${sym}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** A stored decimal (0.085) as a percent string ("8.5%"). */
  function pct(value, decimals) {
    if (!Number.isFinite(value)) return '—';
    const d = decimals === undefined ? 1 : decimals;
    return `${(value * 100).toFixed(d)}%`;
  }

  /** Parse a percent-typed input field (user types "8.5") back into a decimal (0.085). */
  function pctToDecimal(inputValue) {
    const n = parseFloat(inputValue);
    return Number.isFinite(n) ? n / 100 : NaN;
  }

  function decimalToPctInput(value) {
    return Number.isFinite(value) ? (value * 100).toString() : '';
  }

  function num(value, decimals) {
    if (!Number.isFinite(value)) return '—';
    const d = decimals === undefined ? 0 : decimals;
    return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function multiple(value, decimals) {
    if (!Number.isFinite(value)) return '—';
    const d = decimals === undefined ? 1 : decimals;
    return `${value.toFixed(d)}x`;
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.Format = { currencySymbol, money, price, pct, pctToDecimal, decimalToPctInput, num, multiple };
})(window);
