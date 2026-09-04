/**
 * FULCRUM — charts.js
 * Two hand-rolled visualizations, no charting library:
 *  1. heatCellColor — a color-interpolation function for the sensitivity grid
 *  2. renderFootballField — an SVG range-bar chart for the scenario summary
 * Both take plain numbers in and return DOM/strings out. No dependency on state.js.
 */
(function (root) {
  const F = root.Fulcrum.Format;

  /** Interpolate between two hex colors, t in [0,1]. */
  function lerpColor(hexA, hexB, t) {
    const a = hexA.match(/\w\w/g).map((x) => parseInt(x, 16));
    const b = hexB.match(/\w\w/g).map((x) => parseInt(x, 16));
    const c = a.map((av, i) => Math.round(av + (b[i] - av) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  /**
   * Background color for a heatmap cell: low value -> danger wash, mid -> paper,
   * high value -> forest wash. Diverges around the grid's own median so the
   * coloring is relative to THIS grid, not an absolute price scale.
   */
  function heatCellColor(value, gridMin, gridMax) {
    if (!Number.isFinite(value) || gridMax === gridMin) return '#F6F1E6';
    const t = (value - gridMin) / (gridMax - gridMin); // 0..1
    if (t < 0.5) return lerpColor('#A13A2C', '#F6F1E6', t / 0.5 * 0.75 + 0.25); // danger -> paper (never fully saturated)
    return lerpColor('#F6F1E6', '#1F4D3A', (t - 0.5) / 0.5 * 0.75); // paper -> forest
  }

  /** Text color that stays legible against heatCellColor's range. */
  function heatTextColor(value, gridMin, gridMax) {
    if (!Number.isFinite(value) || gridMax === gridMin) return 'var(--ink)';
    const t = (value - gridMin) / (gridMax - gridMin);
    if (t < 0.2 || t > 0.82) return '#F6F1E6';
    return '#1C1712';
  }

  /**
   * Render a football-field range chart into `container` (a DOM node).
   * rows: [{ label, min, max, point, color }]
   * markers: [{ value, label, kind: 'weighted'|'median'|'market' }]
   * currency: for axis labels.
   */
  function renderFootballField(container, rows, markers, currency) {
    const allValues = rows.flatMap((r) => [r.min, r.max]).concat(markers.map((m) => m.value)).filter(Number.isFinite);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const pad = (dataMax - dataMin) * 0.12 || dataMax * 0.1 || 1;
    const scaleMin = Math.max(0, dataMin - pad);
    const scaleMax = dataMax + pad;
    const span = scaleMax - scaleMin || 1;

    const pctOf = (v) => ((v - scaleMin) / span) * 100;

    const rowsHtml = rows.map((r) => `
      <div class="ff-row">
        <div class="ff-label">${r.label}</div>
        <div class="ff-track">
          <div class="ff-bar" style="left:${pctOf(r.min)}%; width:${pctOf(r.max) - pctOf(r.min)}%; background:${r.color};"></div>
          ${Number.isFinite(r.point) ? `<div class="ff-marker" style="left:${pctOf(r.point)}%; background:${r.color};"></div>` : ''}
        </div>
        <div class="ff-point-value">${F.price(r.point, currency)}</div>
      </div>
    `).join('');

    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => scaleMin + (span * i) / (tickCount - 1));
    const scaleHtml = `<div class="ff-scale">${ticks.map((t) => `<span style="left:${pctOf(t)}%;">${F.price(t, currency)}</span>`).join('')}</div>`;

    const markerHtml = markers.map((m) => {
      const colorMap = { weighted: 'var(--oxblood-deep)', median: 'var(--brass)', market: 'var(--slate)' };
      return `<div class="ff-marker-label" style="left:calc(130px + ${pctOf(m.value)}%); color:${colorMap[m.kind] || 'var(--ink)'};">${m.label}</div>`;
    }).join('');

    container.innerHTML = `
      <div style="position:relative;">
        ${markerHtml}
        <div class="football-field">${rowsHtml}</div>
        ${scaleHtml}
      </div>
    `;
  }

  root.Fulcrum = root.Fulcrum || {};
  root.Fulcrum.Charts = { lerpColor, heatCellColor, heatTextColor, renderFootballField };
})(window);
