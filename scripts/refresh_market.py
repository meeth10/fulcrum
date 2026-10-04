#!/usr/bin/env python3
"""Fetch live market data with yfinance and write data/market.json for the site.

A static site can't call Yahoo from the browser (no CORS), so this runs on your Mac or in the
scheduled GitHub Actions deploy, and the page just reads the resulting data/market.json.

For every company listed in data/index.json it records: price, shares outstanding (converted to the
site's unit: crore for INR companies, millions otherwise), beta, currency. For USD it also records
the US 10-year yield as the risk-free rate.

    python3 scripts/refresh_market.py                 # reads data/index.json, writes data/market.json
    python3 scripts/refresh_market.py --data data     # custom data folder
    python3 scripts/refresh_market.py --dry-run       # print, don't write

Safety rules (a wrong market cap quietly ruins every multiple, so we skip rather than guess):
  * price currency must equal the company's reporting currency, otherwise the company is skipped
  * if price x shares disagrees with Yahoo's own market cap by >25%, the entry is kept but flagged
  * nothing is written if no company could be fetched (the previous market.json stays)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

UNIT_DIVISOR = {"INR": 1e7}      # crore; everything else -> millions (1e6)


def _yf():
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("yfinance is not installed. Run:  python3 -m pip install yfinance")
    return yf


def symbol_candidates(ticker: str, currency: str) -> list[str]:
    t = ticker.strip()
    if "." in t or t.startswith("^"):
        return [t]
    if currency.upper() == "INR":
        return [f"{t}.NS", f"{t}.BO", t]
    return [t]


def _num(x):
    try:
        v = float(x)
        return v if v == v and v not in (float("inf"), float("-inf")) else None
    except (TypeError, ValueError):
        return None


def fetch_one(yf, ticker: str, currency: str) -> dict:
    """Try each candidate symbol; return the first that yields a price. Never raises."""
    last_err = "no price returned"
    for sym in symbol_candidates(ticker, currency):
        try:
            tk = yf.Ticker(sym)
            fast = tk.fast_info
            price = _num(getattr(fast, "last_price", None) or fast.get("last_price"))
            if price is None:
                continue
            info = {}
            try:
                info = tk.info or {}
            except Exception as e:                      # .info is the flaky call; fast_info is enough for price
                last_err = f"info unavailable ({type(e).__name__})"
            shares = _num(info.get("sharesOutstanding")) or _num(getattr(fast, "shares", None))
            price_ccy = (info.get("currency") or getattr(fast, "currency", None) or "").upper()
            return {"yahoo_symbol": sym, "price": price, "shares_abs": shares, "price_currency": price_ccy,
                    "beta": _num(info.get("beta")), "market_cap": _num(info.get("marketCap")) or _num(getattr(fast, "market_cap", None)),
                    "financial_currency": (info.get("financialCurrency") or "").upper()}
        except Exception as e:
            last_err = f"{sym}: {type(e).__name__}: {e}"
    return {"error": last_err}


def fetch_us_10y(yf):
    """^TNX quotes the 10-year yield in percent (4.1 = 4.1%). Older feeds quoted x10, so normalise."""
    try:
        v = _num(yf.Ticker("^TNX").fast_info.last_price)
        if v is None:
            return None
        if v > 25:
            v /= 10
        return round(v, 3) if 0 < v < 20 else None
    except Exception:
        return None


def build(companies: list[dict], yf, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    out = {"asof": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "yfinance", "rf": {}, "companies": {}, "skipped": {}}
    for c in companies:
        cid, ticker = c["id"], (c.get("ticker") or "").strip()
        ccy = (c.get("currency") or "INR").upper()
        if not ticker:
            out["skipped"][cid] = "no ticker on the company"
            continue
        r = fetch_one(yf, ticker, ccy)
        if "error" in r:
            out["skipped"][cid] = r["error"]
            continue
        if r["price_currency"] and r["price_currency"] != ccy:
            out["skipped"][cid] = (f"price is quoted in {r['price_currency']} but the company reports in {ccy}; "
                                   f"refusing to mix currencies (set the price by hand)")
            continue
        if not r["shares_abs"]:
            out["skipped"][cid] = "Yahoo returned a price but no share count"
            continue
        shares = r["shares_abs"] / UNIT_DIVISOR.get(ccy, 1e6)
        entry = {"ticker": ticker, "yahoo_symbol": r["yahoo_symbol"], "currency": ccy, "price": round(r["price"], 4),
                 "shares_outstanding": round(shares, 4), "unit": "cr" if ccy == "INR" else "mm",
                 "beta": r["beta"], "as_of": out["asof"]}
        if r["market_cap"]:
            implied = r["price"] * r["shares_abs"]
            if abs(implied / r["market_cap"] - 1) > 0.25:
                entry["warning"] = (f"price x shares ({implied:,.0f}) differs from Yahoo market cap ({r['market_cap']:,.0f}) by "
                                    f"more than 25% - usually multiple share classes; check the share count")
        out["companies"][cid] = entry
    rf = fetch_us_10y(yf) if any(c.get("currency", "").upper() == "USD" for c in companies) else None
    if rf is not None:
        out["rf"]["USD"] = rf
    return out


def load_companies(data: Path) -> list[dict]:
    idx = json.loads((data / "index.json").read_text())
    comps = []
    for e in idx:
        f = data / f"{e['id']}.json"
        full = json.loads(f.read_text()) if f.exists() else {}
        comps.append({"id": e["id"], "ticker": full.get("ticker") or e.get("ticker"),
                      "currency": full.get("currency") or e.get("currency") or "INR", "name": e.get("name")})
    return comps


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    data = Path(a.data)
    comps = load_companies(data)
    if not comps:
        print("data/index.json lists no companies - nothing to do")
        return 0
    result = build(comps, _yf())
    for cid, e in result["companies"].items():
        print(f"  ok   {cid:28s} {e['yahoo_symbol']:12s} price {e['price']:>10,.2f} {e['currency']}  shares {e['shares_outstanding']:>12,.2f} {e['unit']}"
              + (f"   WARNING: {e['warning']}" if e.get("warning") else ""))
    for cid, why in result["skipped"].items():
        print(f"  skip {cid:28s} {why}")
    if result["rf"]:
        print(f"  US 10y risk-free: {result['rf']['USD']}%")
    if not result["companies"]:
        print("no company could be fetched - leaving the existing market.json untouched", file=sys.stderr)
        return 1
    if a.dry_run:
        print(json.dumps(result, indent=2))
        return 0
    (data / "market.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {data / 'market.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
