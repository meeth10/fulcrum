# Fulcrum

Value any company in a minute. A DCF in plain English (sliders, not spreadsheets) next to a peer-multiples view, with charts you can download.

Static site: one `index.html`, no backend. Company data comes from Yahoo Finance and is refreshed by GitHub Actions.

## What is in the folder

- `index.html` is the whole app.
- `data/watchlist.json` is the list of tickers the site keeps fresh (edit it to add companies).
- `scripts/yahoo_company.py` fetches Yahoo data and writes `data/*.json`, `data/lite/*.json`, `data/index.json` and `data/market.json`.
- `.github/workflows/static.yml` runs the script on every push and each weekday, then publishes to GitHub Pages.

## Add a company

Edit `data/watchlist.json`, commit and push. The next deploy fetches it. Indian tickers end in `.NS` (NSE) or `.BO` (BSE).

To fetch locally first:

    python3 -m pip install yfinance
    python3 scripts/yahoo_company.py NVDA

## Visitors can also

- Add a company by hand (a minute, saved in their browser).
- Read the numbers from a filing PDF (in the browser, nothing is uploaded).
- Share a link that carries their story, download a snapshot picture, or save any chart as PNG or SVG.

## Method

Follows Prof. Aswath Damodaran's published approach (story to numbers; FCFF DCF with fading growth and cost of capital; terminal growth capped at the risk-free rate; reinvestment from sales-to-capital and g/ROIC; relative valuation with medians, matched numerator/denominator and a regression view). Written in our own words on the Learn page. Not affiliated with or endorsed by him.

Originals: https://pages.stern.nyu.edu/~adamodar/ · https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html · https://aswathdamodaran.substack.com

Educational tool, not investment advice. Banks and insurers do not fit a firm-level DCF; the site warns when it sees one.
