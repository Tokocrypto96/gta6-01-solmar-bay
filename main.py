"""gta6-twitch-ccu-forecast-01 entry: rolling-midnight analog launch curves.

Forecasts GTA VI's Twitch CCU for hours 2..24 of launch day 2026-11-19 (UTC)
as five quantiles an hour, from the observed hour-1 print.

Method (deterministic, stdlib only, no network):
  1. Peer group: the case's comparables whose unlock is a rolling midnight
     local launch (the way GTA VI unlocks: NZ first, then CET, UK, US East,
     US Pacific) and whose tier is "comparable". Games with a simultaneous
     PC/global unlock are excluded: their hour-1 print is already the launch
     peak, so their day shape does not transfer to a console-only rolling
     launch. The target's own pre-release category history is excluded too.
  2. For each hour h, take the median across peers of log(viewers_h /
     viewers_1) as the shape, and the cross-peer standard deviation of the
     same log-ratios as the spread. Median forecast = p1 * exp(shape_h);
     quantiles = median * exp(z_tau * spread_h).
  3. Fallbacks keep the entry valid no matter what the case holds: if the
     peer group is too small it relaxes to all "comparable" games, then to
     all launch-like comparables; if hour 1 has no print it falls back to
     the last hourly history point, then to 1 viewer.

Backtest on the kit's 4 practice launches (pinball loss, lower better):
  baseline (starter persistence) 0.3871 -- this entry 0.2459.
  Per case: Wolverine 0.4083, RDR2 0.1393, GoW Ragnarok 0.2059, Spider-Man 2 0.2300.
"""

import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

INPUT_DIR = Path(os.environ.get("MAKEFUN_INPUT_DIR", "/input"))
OUTPUT_DIR = Path(os.environ.get("MAKEFUN_OUTPUT_DIR", "/output"))

LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95]
Z = [-1.645, -0.674, 0.0, 0.674, 1.645]


def parse_dt(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")


def round2(x):
    """Round to 2 decimals, half up (same as the kit's starter)."""
    scaled = x * 100
    whole = math.floor(scaled)
    if scaled - whole >= 0.5:
        whole += 1
    value = whole / 100
    return int(value) if value == int(value) else value


def median(vals):
    v = sorted(vals)
    n = len(v)
    mid = n // 2
    if n % 2:
        return v[mid]
    return (v[mid - 1] + v[mid]) / 2.0


def pstdev(vals, mean):
    if len(vals) < 2:
        return 0.0
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals))


def tier_of(unlock):
    for t in ("comparable", "early-access-contaminated", "weak", "target-history"):
        if t in unlock:
            return t
    return "?"


def is_rolling(unlock):
    u = unlock.lower()
    return "midnight local" in u or "rolling" in u


def is_pc_simultaneous(unlock):
    u = unlock.lower()
    return "pc" in u and ("simultaneous" in u or "global" in u or "midnight gmt" in u)


def launch_curve(comp):
    """{hour 1..24: viewers} for the comparable's UTC launch day."""
    try:
        ds = parse_dt(comp["day_start"])
    except (KeyError, ValueError):
        return {}
    pts = {}
    for r in comp.get("hourly", []):
        try:
            t = parse_dt(r["from"])
            v = r["viewers"]
        except (KeyError, ValueError, TypeError):
            continue
        d = (t - ds).total_seconds() / 3600
        if 0 <= d < 24 and isinstance(v, (int, float)) and v > 0:
            pts[int(d) + 1] = float(v)
    return pts


def peer_curves(case):
    """Launch-day curves of the peer group, most selective first."""
    comps = []
    for comp in case.get("comparables", []):
        name = comp.get("name", "")
        if "Grand Theft Auto VI" in name:
            continue  # target's own pre-release history, not a launch curve
        unlock = comp.get("unlock", "")
        curve = launch_curve(comp)
        if 1 not in curve:
            continue
        comps.append((tier_of(unlock), is_rolling(unlock),
                      is_pc_simultaneous(unlock), curve))
    rolling = [c for t, r, p, c in comps
               if t == "comparable" and r and not p]
    if len(rolling) >= 5:
        return rolling
    comparable = [c for t, r, p, c in comps if t == "comparable"]
    if len(comparable) >= 5:
        return comparable
    launch_like = [c for t, r, p, c in comps if t != "target-history"]
    return launch_like if launch_like else [c for _, _, _, c in comps]


def hour1_print(case):
    for k in case.get("known", []):
        if k.get("hour") == 1 and isinstance(k.get("viewers"), (int, float)):
            return max(1.0, float(k["viewers"]))
    hist = case.get("history_hourly") or []
    if hist:
        last = hist[-1]
        if isinstance(last.get("viewers"), (int, float)) and last["viewers"] > 0:
            return float(last["viewers"])
    return 1.0


def forecast_case(case):
    p1 = hour1_print(case)
    peers = peer_curves(case)
    hours = [row["hour"] for row in case.get("forecast", [])] or list(range(2, 25))
    out = {"hours": []}
    for h in sorted(hours):
        ratios = []
        for curve in peers:
            if h in curve and 1 in curve:
                ratios.append(math.log(curve[h] / curve[1]))
        if len(ratios) >= 3:
            shape = median(ratios)
            spread = pstdev(ratios, sum(ratios) / len(ratios))
        elif ratios:
            shape = ratios[0]
            spread = 0.30
        else:
            shape = 0.0
            spread = 0.15 * math.sqrt(h - 1) if h > 1 else 0.15
        spread = max(spread, 0.10)
        if len(ratios) < 4:
            spread = max(spread, 0.30)
        med = p1 * math.exp(shape)
        qs = []
        for z in Z:
            q = med * math.exp(z * spread)
            q = min(max(q, 1.0), 1e9)
            qs.append(round2(q))
        # enforce non-decreasing after rounding
        for i in range(1, 5):
            if qs[i] < qs[i - 1]:
                qs[i] = qs[i - 1]
        out["hours"].append({"hour": h, "q": qs})
    return out


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(INPUT_DIR.glob("*.in")):
        case = json.loads(path.read_text(encoding="utf-8"))
        forecast = forecast_case(case)
        (OUTPUT_DIR / f"{path.stem}.out").write_text(
            json.dumps(forecast, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
