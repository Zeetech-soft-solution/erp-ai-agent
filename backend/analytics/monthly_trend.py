"""Monthly trend: the sample analysis of the Python analytics engine.

Input  (stdin, JSON): {"rows": [{"date": "2026-01-14", "total": 1200.0}, ...]}
Output (stdout, JSON): KPIs, a chart specification and observations.

The rows use canonical field names (date, total), the data contract every
connector maps its native fields to, so the analysis works for any ERP.
The rows never reach the language model; only this output does.
"""
import json
import sys

import numpy as np
import pandas as pd


def analyse(rows):
    df = pd.DataFrame(rows)
    if df.empty or "date" not in df or "total" not in df:
        return {"kpis": [], "chart": None, "observations": ["No records in the period."]}

    df["date"] = pd.to_datetime(df["date"])
    df["total"] = pd.to_numeric(df["total"], errors="coerce").fillna(0.0)
    monthly = df.set_index("date")["total"].resample("MS").sum()
    growth = monthly.pct_change().mul(100).round(1)

    # Linear projection for the next month (least squares over the series).
    if len(monthly) > 1:
        slope, intercept = np.polyfit(np.arange(len(monthly)), monthly.values, 1)
    else:
        slope, intercept = 0.0, float(monthly.iloc[0])
    projection = max(0.0, float(slope * len(monthly) + intercept))

    best = monthly.idxmax()
    observations = [
        f"Highest month: {best:%B %Y} at {monthly.max():,.2f}.",
        f"The trend is {'rising' if slope > 0 else 'falling' if slope < 0 else 'flat'} by about {abs(slope):,.2f} per month.",
    ]
    if growth.notna().any():
        observations.append(f"Latest month-on-month change: {growth.iloc[-1]:+.1f}%.")

    return {
        "kpis": [
            {"label": "Total", "value": round(float(monthly.sum()), 2)},
            {"label": "Average per month", "value": round(float(monthly.mean()), 2)},
            {"label": "Projected next month", "value": round(projection, 2)},
        ],
        "chart": {
            "type": "line",
            "labels": [d.strftime("%b %Y") for d in monthly.index],
            "series": [{"name": "Total", "values": [round(float(v), 2) for v in monthly.values]}],
        },
        "observations": observations,
    }


if __name__ == "__main__":
    print(json.dumps(analyse(json.load(sys.stdin).get("rows", []))))
