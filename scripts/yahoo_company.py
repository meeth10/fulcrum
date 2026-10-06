#!/usr/bin/env python3
"""One place for company data: Yahoo Finance (yfinance) -> data/<id>.json, for ANY ticker.

For every company this fills the same record the site already reads -- income statement, balance
sheet, cash flow (annual FY, quarterly Q#FY and a computed TTM) plus market data -- so the
Financials, DCF and Comps tabs update on their own.

    python3 scripts/yahoo_company.py NVDA MSFT RELIANCE   # add tickers, fetch everything, write data/
    python3 scripts/yahoo_company.py --all                # refresh every ticker in the watchlist + index
    python3 scripts/yahoo_company.py NVDA --dry-run       # show what would be written
    python3 scripts/yahoo_company.py --all --market-only  # prices/shares/beta only (fast)

Precedence (so nothing you extracted from a filing is ever overwritten):
  * a (statement, period) that already has data from a filing / PDF / manual entry is left alone;
    Yahoo only fills the (statement, period) combinations that are empty, and refreshes its own rows.
  * a price or share count you typed by hand (market.source == "manual") is kept.
Safety: if the price currency differs from the reporting currency (ADRs), the price is NOT stored.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

CORE = {   # canonical key -> Yahoo row labels in priority order (first one present wins)
    "income_statement": {
        "revenue": ["Total Revenue", "Operating Revenue"],
        "ebitda": ["EBITDA", "Normalized EBITDA"],
        "ebit": ["Operating Income", "EBIT"],
        "net_income": ["Net Income", "Net Income Common Stockholders", "Net Income From Continuing Operation Net Minority Interest"],
    },
    "balance_sheet": {
        "shareholders_equity": ["Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"],
        "total_debt": ["Total Debt"],
        "cash_and_equivalents": ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"],
        "total_assets": ["Total Assets"],
        "total_liabilities": ["Total Liabilities Net Minority Interest"],
    },
    "cash_flow": {
        "operating_cash_flow": ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"],
        "capital_expenditure": ["Capital Expenditure"],
    },
}
FRAMES = {  # statement -> (annual attr, quarterly attr)
    "income_statement": ("income_stmt", "quarterly_income_stmt"),
    "balance_sheet": ("balance_sheet", "quarterly_balance_sheet"),
    "cash_flow": ("cashflow", "quarterly_cashflow"),
}
FUNDAMENTALS = ["revenue", "ebitda", "ebit", "net_income", "shareholders_equity", "total_debt",
                "cash_and_equivalents", "operating_cash_flow", "capital_expenditure"]
SHARE_ROWS = re.compile(r"(shares|share issued)", re.I)
PER_SHARE = re.compile(r"\beps\b|per share", re.I)
SKIP_ROWS = re.compile(r"tax rate", re.I)


# ----------------------------------------------------------------------------- small helpers
def _yf():
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("yfinance is not installed. Run:  python3 -m pip install yfinance")
    return yf


def num(x):
    try:
        v = float(x)
        return v if v == v and abs(v) != float("inf") else None
    except (TypeError, ValueError):
        return None


def to_date(x) -> dt.date | None:
    try:
        return (x.to_pydatetime() if hasattr(x, "to_pydatetime") else x).date()
    except Exception:
        return None


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def snake(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def unit_for(ccy: str) -> tuple[float, str]:
    """(divisor, unit tag) -- INR in crore, everything else in millions, matching the site."""
    return (1e7, "cr_inr") if ccy == "INR" else (1e6, f"{ccy.lower()}_mm")


def norm_date(d: dt.date) -> dt.date:
    """Shift back a week so a 52/53-week year ending Jan 2 or a quarter ending Dec 27 lands in the right month."""
    return d - dt.timedelta(days=7)


def fy_label(d: dt.date) -> str:
    return f"FY{norm_date(d).year}"


def quarter_label(d: dt.date, fye_month: int) -> str | None:
    n = norm_date(d)
    k = (n.month - fye_month) % 12
    if k % 3:
        return None                      # not on the company's quarter grid -> don't guess
    q = 4 if k == 0 else k // 3
    fy = n.year + (1 if n.month > fye_month else 0)
    return f"Q{q}FY{fy}"


def candidates(ticker: str, currency: str | None) -> list[str]:
    t = ticker.strip().upper()
    if "." in t or t.startswith("^"):
        return [t]
    if currency and currency.upper() == "INR":
        return [f"{t}.NS", f"{t}.BO", t]
    return [t, f"{t}.NS", f"{t}.BO"]


# ----------------------------------------------------------------------------- Yahoo fetch
def fetch(yf, ticker: str, currency: str | None, market_only: bool = False) -> dict:
    last = "no price returned"
    for sym in candidates(ticker, currency):
        try:
            tk = yf.Ticker(sym)
            fast = tk.fast_info
            price = num(getattr(fast, "last_price", None) or (fast.get("last_price") if hasattr(fast, "get") else None))
            if price is None:
                continue
            info = {}
            try:
                info = tk.info or {}
            except Exception as e:
                last = f"info unavailable ({type(e).__name__})"
            out = {"symbol": sym, "price": price, "info": info,
                   "shares": num(info.get("sharesOutstanding")) or num(getattr(fast, "shares", None)),
                   "price_ccy": (info.get("currency") or getattr(fast, "currency", None) or "").upper(),
                   "fin_ccy": (info.get("financialCurrency") or "").upper(),
                   "frames": {}}
            if not market_only:
                for stmt, (ann, qtr) in FRAMES.items():
                    for kind, attr in (("annual", ann), ("quarterly", qtr)):
                        try:
                            df = getattr(tk, attr)
                            out["frames"][(stmt, kind)] = df if df is not None and not df.empty else None
                        except Exception:
                            out["frames"][(stmt, kind)] = None
            return out
        except Exception as e:
            last = f"{sym}: {type(e).__name__}: {e}"
    return {"error": last}


def fetch_us_10y(yf):
    try:
        v = num(yf.Ticker("^TNX").fast_info.last_price)
        if v is None:
            return None
        v = v / 10 if v > 25 else v
        return round(v, 3) if 0 < v < 20 else None
    except Exception:
        return None


# ----------------------------------------------------------------------------- statements
def cell(value, unit, raw, source, fy):
    return {"consolidated": {"value": value, "unit": unit, "metric_raw": raw, "source_page": None,
                             "source_table": source, "source_heading": None, "extraction_method": "yfinance",
                             "extraction_confidence": 0.8, "doc_type": "yahoo_finance", "fiscal_year": fy},
            "standalone": None, "unspecified": None}


def rows_of(df):
    """-> {label: {date: value}} from a yfinance statement frame (labels = rows, dates = columns)."""
    out = {}
    for label in df.index:
        series = {}
        for col in df.columns:
            d, v = to_date(col), num(df.loc[label, col])
            if d is not None and v is not None:
                series[d] = v
        if series:
            out[str(label)] = series
    return out


def metric_key(stmt: str, label: str, rows: dict) -> str:
    for key, labels in CORE[stmt].items():
        for l in labels:                       # first label that actually exists in this frame wins
            if l in rows:
                if l == label:
                    return key
                break
    return snake(label)


def value_and_unit(label: str, v: float, div: float, tag: str):
    if PER_SHARE.search(label):
        return v, "per_share"
    if SHARE_ROWS.search(label):
        return v / div, "shares_cr" if tag == "cr_inr" else "shares_mm"
    return v / div, tag


def build_statements(frames: dict, ccy: str, fye_month: int | None, source_note: str = "Yahoo Finance") -> dict:
    """-> {statement: {period: {metric: cell}}} for annual FY, quarterly Q#FY and TTM periods."""
    div, tag = unit_for(ccy)
    result: dict = {s: {} for s in FRAMES}
    for stmt in FRAMES:
        for kind in ("annual", "quarterly"):
            df = frames.get((stmt, kind))
            if df is None:
                continue
            rows = rows_of(df)
            dates = sorted({d for series in rows.values() for d in series}, reverse=True)
            labels = {}
            for d in dates:
                if kind == "annual":
                    labels[d] = fy_label(d)
                elif fye_month:
                    q = quarter_label(d, fye_month)
                    if q:
                        labels[d] = q
            for label, series in rows.items():
                if SKIP_ROWS.search(label):
                    continue
                key = metric_key(stmt, label, rows)
                for d, v in series.items():
                    period = labels.get(d)
                    if not period:
                        continue
                    val, unit = value_and_unit(label, v, div, tag)
                    result[stmt].setdefault(period, {}).setdefault(key, cell(
                        round(val, 4), unit, label, f"{source_note} {kind} {FRAMES[stmt][0]}", period))
            # TTM = sum of the four most recent consecutive quarters (flows only; a balance sheet has no TTM)
            if kind == "quarterly" and stmt != "balance_sheet" and fye_month:
                latest = [d for d in dates if d in labels][:4]
                if len(latest) == 4 and all(70 <= (latest[i] - latest[i + 1]).days <= 110 for i in range(3)):
                    ttm = "TTM" + labels[latest[0]]
                    for label, series in rows.items():
                        if SKIP_ROWS.search(label) or SHARE_ROWS.search(label) or not all(d in series for d in latest):
                            continue
                        key = metric_key(stmt, label, rows)
                        val, unit = value_and_unit(label, sum(series[d] for d in latest), div, tag)
                        result[stmt].setdefault(ttm, {}).setdefault(key, cell(
                            round(val, 4), unit, label + " (sum of last 4 quarters)", f"{source_note} computed TTM", ttm))
    return result


def merge_statements(existing: dict, new: dict) -> tuple[dict, dict]:
    """Filing/PDF/manual data wins per (statement, period); Yahoo refreshes its own rows and fills gaps."""
    merged = {s: dict(existing.get(s, {})) for s in FRAMES}
    stats = {"added_periods": 0, "kept_from_filings": 0}
    for stmt, periods in new.items():
        for period, metrics in periods.items():
            old = merged[stmt].get(period, {})
            has_non_yahoo = any((c or {}).get("extraction_method") != "yfinance"
                                for variants in old.values() for c in (variants or {}).values() if c)
            if has_non_yahoo:
                stats["kept_from_filings"] += 1
                continue
            if period not in merged[stmt]:
                stats["added_periods"] += 1
            merged[stmt][period] = metrics          # replaces the previous Yahoo rows for this period
    return merged, stats


def derive_fundamentals(statements: dict, prebaked: dict) -> dict:
    out = {p: dict(v) for p, v in (prebaked or {}).items()}
    for stmt, keys in CORE.items():
        for period, metrics in statements.get(stmt, {}).items():
            for key in keys:
                variants = metrics.get(key)
                if not variants:
                    continue
                c = variants.get("consolidated") or variants.get("standalone") or variants.get("unspecified")
                if c and key in FUNDAMENTALS:
                    out.setdefault(period, {})[key] = c["value"]
    for p in out:
        for k in FUNDAMENTALS:
            out[p].setdefault(k, None)
    return out


def period_sort_key(p: str):
    tier = 0 if p.startswith("FY") else 1 if p.startswith("Q") else 2 if p.startswith("TTM") else 3
    years = re.findall(r"\d{4}", p)
    return (years[-1] if years else "0", tier, p)


# ----------------------------------------------------------------------------- orchestration
def build_company(yf, ticker: str, data: Path, existing_by_ticker: dict, market_only: bool, now: str) -> tuple[dict | None, str]:
    known = existing_by_ticker.get(ticker.upper())
    known_ccy = known.get("currency") if known else None
    r = fetch(yf, ticker, known_ccy, market_only)
    if "error" in r:
        return None, r["error"]
    info = r["info"]
    fin_ccy = r["fin_ccy"] or r["price_ccy"] or (known_ccy or "USD")
    ccy = (known_ccy or fin_ccy).upper()
    cid = known["id"] if known else slug(re.sub(r"\.(NS|BO)$", "", r["symbol"], flags=re.I))
    path = data / f"{cid}.json"
    company = json.loads(path.read_text()) if path.exists() else {}
    company.update({"id": cid, "ticker": company.get("ticker") or ticker.upper().split(".")[0],
                    "name": company.get("name") or info.get("longName") or info.get("shortName") or ticker.upper(),
                    "sector": company.get("sector") or info.get("sector") or "", "currency": ccy})
    notes = []

    # --- statements
    if not market_only:
        if fin_ccy and fin_ccy != ccy:
            notes.append(f"statements skipped: Yahoo reports in {fin_ccy} but this company is stored in {ccy}")
        else:
            fye = None
            ann = r["frames"].get(("income_statement", "annual"))
            if ann is None:
                ann = r["frames"].get(("balance_sheet", "annual"))
            if ann is not None and len(ann.columns):
                d = to_date(sorted(ann.columns, reverse=True)[0])
                fye = norm_date(d).month if d else None
            new = build_statements(r["frames"], ccy, fye)
            merged, stats = merge_statements(company.get("statements", {}), new)
            company["statements"] = merged
            periods = sorted({p for s in merged.values() for p in s}, key=period_sort_key)
            company["periods"] = periods
            company["fundamentals"] = derive_fundamentals(merged, company.get("fundamentals"))
            notes.append(f"{stats['added_periods']} new statement-periods from Yahoo, {stats['kept_from_filings']} kept from filings")
            if not any(new[s] for s in new):
                notes.append("Yahoo returned no statements for this ticker (common for banks/new listings)")

    # --- market
    mk = company.get("market") or {}
    if mk.get("source") == "manual":
        notes.append("price/shares kept: typed by hand")
    else:
        mk = {"price": None, "shares_outstanding": None, "beta": None, "net_debt_override": mk.get("net_debt_override"),
              "source": "yfinance", "as_of": now, "warning": None}
        if r["price_ccy"] and r["price_ccy"] != ccy:
            mk["warning"] = f"price quoted in {r['price_ccy']} but statements are in {ccy}; price not stored"
        elif not r["shares"]:
            mk["warning"] = "Yahoo returned a price but no share count"
        else:
            div = 1e7 if ccy == "INR" else 1e6
            mk.update(price=round(r["price"], 4), shares_outstanding=round(r["shares"] / div, 4), beta=num(info.get("beta")))
            cap = num(info.get("marketCap"))
            if cap and abs(r["price"] * r["shares"] / cap - 1) > 0.25:
                mk["warning"] = "price x shares differs from Yahoo market cap by >25% (multiple share classes?) - check the share count"
        company["market"] = mk
    company.setdefault("statements", {s: {} for s in FRAMES})
    company.setdefault("periods", [])
    company.setdefault("fundamentals", {})
    company.pop("comps", None)          # the site computes comps itself; a stale pre-baked copy only confuses
    return company, "; ".join(notes)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tickers", nargs="*", help="tickers to add/refresh, e.g. NVDA RELIANCE.NS")
    ap.add_argument("--all", action="store_true", help="refresh every ticker in data/watchlist.json and data/index.json")
    ap.add_argument("--data", default="data")
    ap.add_argument("--market-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    data = Path(a.data)
    data.mkdir(parents=True, exist_ok=True)

    idx_path, wl_path = data / "index.json", data / "watchlist.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else []
    watch = json.loads(wl_path.read_text()).get("tickers", []) if wl_path.exists() else []
    by_ticker = {}
    for e in index:
        f = data / f"{e['id']}.json"
        full = json.loads(f.read_text()) if f.exists() else {}
        t = (e.get("ticker") or full.get("ticker") or "").upper()
        if t:
            by_ticker[t] = {"id": e["id"], "currency": full.get("currency") or e.get("currency")}
    wanted = [t.upper() for t in a.tickers]
    if a.all or not wanted:
        wanted += [t for t in watch if t.upper() not in wanted] + [t for t in by_ticker if t not in wanted]
    if not wanted:
        print("nothing to do - pass tickers or add some to data/watchlist.json")
        return 0
    yf = _yf()
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    done, market = 0, {}
    for t in wanted:
        company, note = build_company(yf, t, data, by_ticker, a.market_only, now)
        if company is None:
            print(f"  FAIL {t:12s} {note}")
            continue
        done += 1
        mk = company["market"]
        print(f"  ok   {t:12s} {company['id']:22s} {company['currency']} price {mk.get('price')} shares {mk.get('shares_outstanding')} "
              f"periods {len(company['periods'])}" + (f"  [{note}]" if note else "") + (f"  WARNING: {mk['warning']}" if mk.get("warning") else ""))
        if not a.dry_run:
            (data / f"{company['id']}.json").write_text(json.dumps(company, indent=1) + "\n")
            entry = {"id": company["id"], "name": company["name"], "ticker": company["ticker"], "sector": company["sector"],
                     "currency": company["currency"], "periods": company["periods"]}
            index = [e for e in index if e["id"] != company["id"]] + [entry]
            by_ticker[company["ticker"].upper()] = {"id": company["id"], "currency": company["currency"]}
            if company["ticker"].upper() not in [w.upper() for w in watch]:
                watch.append(company["ticker"].upper())
        if mk.get("price") is not None:
            market[company["id"]] = {"ticker": company["ticker"], "currency": company["currency"], "price": mk["price"],
                                     "shares_outstanding": mk["shares_outstanding"], "beta": mk.get("beta"),
                                     "as_of": now, "warning": mk.get("warning")}
    if not done:
        print("nothing could be fetched - existing files left untouched", file=sys.stderr)
        return 1
    if not a.dry_run:
        rf = fetch_us_10y(yf)
        idx_path.write_text(json.dumps(index, indent=1) + "\n")
        wl_path.write_text(json.dumps({"tickers": watch}, indent=1) + "\n")
        (data / "market.json").write_text(json.dumps({"asof": now, "source": "yfinance", "rf": {"USD": rf} if rf else {},
                                                      "companies": market}, indent=1) + "\n")
        print(f"wrote {done} company file(s), index.json, watchlist.json, market.json to {data}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
