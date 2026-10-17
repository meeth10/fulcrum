# Fulcrum

Built and maintained by Shourya.

Value any company in a minute. A DCF in plain English (sliders, not spreadsheets) next to a peer-multiples view, with charts you can download.

Static site: one `index.html`, no backend. Company data comes from Yahoo Finance and is refreshed by GitHub Actions or by running the script yourself.

## What is in the folder

- `index.html` is the whole app.
- `data/watchlist.json` is the list of tickers the site keeps fresh (edit it to add companies).
- `scripts/yahoo_company.py` fetches Yahoo data and writes `data/*.json`, `data/lite/*.json`, `data/index.json` and `data/market.json`.
- `.github/workflows/static.yml` runs the script on every push and each weekday, then publishes to GitHub Pages.
- `.github/ISSUE_TEMPLATE/add-company.yml` is the form visitors fill in from the site's "Request a company" box.

## How companies are valued

The page reads each company's industry from Yahoo Finance and picks a setup:

| Kind | Method |
|---|---|
| Banks, insurers, lenders | Equity model: book equity, return on equity, cost of equity (book value plus the present value of excess returns) |
| Software, internet, IT services | Cash-flow DCF with longer margin ramp, disciplined growth, bottom-up beta |
| Semiconductors, hardware | Cash-flow DCF with a through-the-cycle margin and real capital needs |
| Energy, materials, autos, transport | Cash-flow DCF on the average margin over the cycle |
| Utilities, telecom, real estate | Cash-flow DCF with expensive growth and low risk (real estate carries a warning) |
| Everything else | The standard cash-flow DCF |

All of them follow Prof. Aswath Damodaran's published approach: story to numbers; growth fading to a rate the economy can sustain; margin converging; reinvestment from sales-to-capital; cost of capital from risk-free rate, equity risk premium and a bottom-up beta; terminal growth capped at the risk-free rate with reinvestment of g divided by return on capital. Written in our own words on the Learn page. The sector starting points are Fulcrum's own, in the spirit of his industry tables. Not affiliated with or endorsed by him.

Things worth knowing:

- Cash includes short-term investments. Minority interests come off equity value.
- Year 1 growth blends analyst consensus (when Yahoo has it) with history; years 2 to 5 are pulled toward a normal long-run rate and capped by company size.
- The rupee risk-free rate is the government bond yield less India's sovereign default spread (6.5% − 1.9% = 4.6%), because default risk is already inside the 7.08% equity premium. Export-heavy Indian sectors (IT services, software, pharma) blend the premium toward the mature-market figure.
- Where a company has no value for a multiple, the Peers page says why (for example "EBITDA is negative" or "debt or cash not reported").
- Reported debt that includes a finance arm (carmakers, equipment makers) can push equity to zero. The page says so.

## Add a company

Visitors use the "Request a company" box on the Data page, which opens a public GitHub issue. To add one yourself, edit `data/watchlist.json`, commit and push. The next deploy fetches it. Indian tickers end in `.NS` (NSE) or `.BO` (BSE).

To fetch locally first:

    python3 -m pip install yfinance
    python3 scripts/yahoo_company.py NVDA

## Refreshing data

Prices update once a day: the workflow runs on weekdays at 13:30 UTC (7:00 pm IST). Statements change when companies report results. Run the script locally and push if you want fresh data sooner.

## Visitors can

Value any listed company, move the sliders, share a link that carries their story, download a snapshot picture, or save any chart as PNG or SVG. Nothing is stored in their browser and no data is entered by visitors.

Educational tool, not investment advice.

## Security notes

- No tokens, keys or logins anywhere in the site, and no third-party scripts, fonts or images. A strict content-security policy limits the page to its own files.
- Nothing is sent to a server and nothing is saved in the visitor's browser.
- The only outbound link that does anything is "Request a company", which opens a public GitHub issue form for the visitor to submit under their own account.
- To add companies, edit `data/watchlist.json` in the repo. Turn on two-factor authentication for the GitHub account that owns it.
