# FULCRUM
### Discounted cash flow & scenario valuation

FULCRUM is a no-AI DCF workbench. Financial statements, scenario assumptions and
cost-of-capital choices are yours. The only thing fetched automatically is market
data (share price, share count, beta, US 10-year yield) from Yahoo Finance, written
to `data/market.json` by `scripts/refresh_market.py` on a weekday schedule and
clearly labelled in the UI. Type a price yourself and your number wins over Yahoo's.
That's a deliberate constraint, not a limitation: the tool exists so you can
see, defend, and hand off every assumption behind a valuation.

Methodology follows standard institutional practice — Damodaran's bottom-up
beta and two-stage DCF framework, CFA-curriculum WACC and terminal-value
mechanics.

---

## Running it

No build step, no dependencies, no server required for local use:

```
open index.html
```

...in a browser. Or serve it (recommended once you're using GitHub sync,
since some browsers restrict `fetch` from `file://` pages):

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. It also works as-is on GitHub Pages —
push the repo, enable Pages on the `main` branch, done.

Start with **Load sample case** in the sidebar to see a fully wired
(entirely fictional) illustrative example — "Meridian Instruments, Inc." —
before entering your own numbers.

---

## Workflow

The seven steps in the sidebar are meant to be worked top to bottom:

01. **Company & Case** — identity, share count, valuation date, mid-year
    convention, and which route (FCFF or FCFE) leads the headline number.
02. **Financial Statements** — transcribe several years of Income Statement,
    Balance Sheet, and Cash Flow actuals. The most recent column becomes the
    base year every scenario projects forward from.
03. **Cost of Capital** — CAPM cost of equity with an optional bottom-up beta
    (unlever each comp at its own structure, average, relever at your
    target), cost of debt from a direct rate or a synthetic rating off
    interest coverage, and the resulting WACC.
04. **Scenarios & Assumptions** — define as many cases as the story needs.
    Each is a fully independent DCF: its own revenue growth path, margin
    path, D&A/CapEx/NWC assumptions, terminal value method, and probability
    weight. A live price-per-share updates as you edit.
05. **Valuation Output** — the full explicit-period cashflow build, the
    firm-to-equity bridge, and an automatic FCFF vs. FCFE reconciliation
    check (flagged if the two independent routes diverge by more than 15%).
06. **The Gimbal** — a two-variable sensitivity heatmap (choose any two of
    WACC, terminal growth, terminal-year revenue growth, terminal-year EBIT
    margin, exit multiple), plus a third variable as a live slider that
    reshapes the entire grid as you move it.
07. **Summary & Football Field** — probability-weighted fair value, the
    median across every simulated outcome (every scenario's full sensitivity
    grid, pooled — not just the handful of headline points), dispersion, and
    a football-field chart against the current market price if you supplied
    one.

## Saving your work

Every keystroke autosaves to the browser's local storage, so a refresh
won't lose anything. For anything you want to keep long-term or share:

- **Export JSON** (sidebar) downloads the full case as a `.json` file.
- **GitHub save / load** (sidebar) commits/reads case files directly to a
  repo of your choosing, the same pattern as FRAME. You'll need a GitHub
  Personal Access Token with **Contents: Read and write** on that repo
  (fine-grained token) or classic `repo` scope. The token lives only in
  memory for the session — it is never written to disk, committed, or
  included in an exported case file.

## A few things worth knowing before you present this

- **The synthetic cost-of-debt spread table** (`js/calc/wacc.js`,
  `SYNTHETIC_SPREAD_TABLE`) mirrors the *shape* of Damodaran's published
  interest-coverage-to-rating table, but the spread values are illustrative
  placeholders. Pull his current table from the NYU Stern site before
  relying on the synthetic-rating cost of debt for real work — or just use
  a direct pretax rate instead.
- **Terminal growth is capped by discount rate, not enforced against a
  macro ceiling.** FULCRUM will flag (not block) a Gordon growth rate that
  looks aggressive relative to a long-run risk-free rate — you decide.
- **Nothing here is investment advice**, and the tool doesn't pretend
  otherwise — it's a calculator for your own assumptions.

## File map

```
index.html              app shell, sidebar nav, script load order
css/styles.css           design system (all styling lives here)
data/sample-case.js      fictional demo case ("Meridian Instruments")

js/calc/                 pure calculation engine — no DOM, unit-testable
  finance-utils.js        fade paths, PV math, median/weighted average
  wacc.js                 CAPM, bottom-up beta, cost of debt, WACC blend
  dcf.js                  FCFF/FCFE projection, terminal value, discounting
  sensitivity.js           2-variable grid generator (the gimbal backend)
  scenarios.js             weighted average + median-of-distribution
  derive.js                glue: raw app state -> calc-engine-ready inputs

js/state.js              central store: get/patch/mutate + localStorage
js/format.js             currency/percent/number display formatting
js/github-sync.js        PAT-based save/load against the GitHub Contents API
js/charts.js             heatmap coloring + hand-rolled football field SVG

js/ui/                   one file per sidebar step, plus:
  helpers.js               shared DOM/binding helpers
  sync-modal.js             GitHub save/load modal

js/main.js               router: step navigation, warning flags, wiring
```

To extend the calculation engine (a new terminal-value method, a different
sensitivity variable), everything lives in `js/calc/` and has no DOM
dependency — you can unit-test additions the same way this was built:
`node -e "require('./js/calc/dcf.js') ..."`.


## Company data: one place

Everything about a company lives in one record, `data/<id>.json` (statements, fundamentals, market).
The DCF, Comps and Financials tabs all read only that record, so anything that fills it flows everywhere.

| Source | How it gets in | Priority |
|---|---|---|
| Filing / PDF | `fulcrum-extract` pipeline, or **Upload PDF** in the page | highest, never overwritten |
| Yahoo Finance | `python3 scripts/yahoo_company.py NVDA`, or **Data tab → Add & fetch** | fills periods a filing doesn't cover |
| Typed by hand | Edit company panel | a hand-typed price/shares is kept |

* `data/watchlist.json` is the list of tickers to keep fresh. Adding a ticker (Data tab, or the command above)
  puts it there. The deploy workflow runs `scripts/yahoo_company.py --all` on every push and every weekday evening.
* Yahoo periods are labelled the way filings are: `FY2025`, `Q2FY2026`, and a computed `TTMQ2FY2026`
  (sum of the last four quarters). Each company's own fiscal year-end is detected.
* Ticker suffixes: bare Indian tickers (`RELIANCE`) try `.NS` then `.BO`; use `TCS.NS` explicitly to be sure.
* If a price is quoted in a different currency than the statements (some ADRs), the price is not stored.


## Focus: DCF and Comps (no Financials tab)

The statement tables are no longer a screen to browse or retype. They are plumbing: Yahoo and your filings
fill `data/<id>.json`, and the DCF and Comps tabs read from it. The **DCF** tab shows a *History* strip
(revenue, growth, EBIT margin, effective tax, D&A %, capex %, free cash flow, with a Yahoo/Filing tag per year)
and builds its forecast from it:

* revenue growth = multi-year revenue CAGR (capped at 30%), fading to a mature rate by year 5; if only one year
  is loaded it uses year-over-year growth of the base period
* EBIT margin = latest base period; tax = average effective rate (tax / pre-tax income); D&A, capex and working
  capital from the cash-flow history; capex fades toward maintenance by year 5
* forecast rows follow the data until you type over a cell; **Rebuild forecast from the data** re-links them

The **Data** tab shows which source every statement-period came from.
