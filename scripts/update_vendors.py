"""
Wang Report — Vendor Update Script
Runs daily via GitHub Actions.
Fetches NVD, CISA KEV, and (optionally) News API.
Writes updated data/vendors.json and .pr_body.md for the PR description.

PROTECTED FIELDS — never overwritten by this script:
  wr_featured, wr_take, rrr_react, rrr_respond, rrr_resilient, serial
"""

import json
import os
import time
import requests
from datetime import datetime, timedelta, timezone

# ── Config ────────────────────────────────────────────────
VENDORS_PATH   = "data/vendors.json"
PR_BODY_PATH   = ".pr_body.md"
NVD_API_KEY    = os.getenv("NVD_API_KEY", "")
NEWS_API_KEY   = os.getenv("NEWS_API_KEY", "")
KEV_FEED_URL   = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
NVD_BASE_URL   = "https://services.nvd.nist.gov/rest/json/cves/2.0"
NEWS_BASE_URL  = "https://newsapi.org/v2/everything"
LOOKBACK_DAYS  = 365
NVD_DELAY      = 6  # seconds between NVD requests (unauthenticated limit)

PROTECTED_FIELDS = {
    "wr_featured", "wr_take", "wr_grade_override",
    "rrr_react", "rrr_respond", "rrr_resilient",
    "serial", "id", "name", "monogram", "market_position"
}

# ── Grading logic ─────────────────────────────────────────
def compute_score(vendor):
    mttp  = vendor.get("mttp_days", 90)
    kev   = vendor.get("kev_count", 0)
    zd    = vendor.get("zero_days", 0)
    total = max(vendor.get("cves_12m", 1), 1)
    crit  = vendor.get("critical_count", 0)

    mttp_score = (100 if mttp <= 7 else 80 if mttp <= 14 else 60 if mttp <= 30 else 35 if mttp <= 60 else 10)
    kev_score = (100 if kev == 0 else 70 if kev <= 2 else 50 if kev <= 5 else 25 if kev <= 10 else 5)
    zd_score = (100 if zd == 0 else 75 if zd == 1 else 50 if zd <= 3 else 20)
    crit_ratio = crit / total
    crit_score = max(0, 100 - int(crit_ratio * 200))

    score = int(
        mttp_score * 0.30 +
        kev_score  * 0.25 +
        zd_score   * 0.20 +
        crit_score * 0.15 +
        50         * 0.10  # trend placeholder
    )
    grade = ("A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "F")
    return score, grade


# ── KEV fetch ─────────────────────────────────────────────
def fetch_kev_set():
    try:
        r = requests.get(KEV_FEED_URL, timeout=30)
        r.raise_for_status()
        vulns = r.json().get("vulnerabilities", [])
        return {v["cveID"] for v in vulns}
    except Exception as e:
        print(f"[WARN] KEV fetch failed: {e}")
        return set()


# ── NVD fetch ─────────────────────────────────────────────
def fetch_nvd_cves(vendor_name, lookback_days=LOOKBACK_DAYS, api_key=NVD_API_KEY):
    start = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime(
        "%Y-%m-%dT%H:%M:%S.000 UTC-00:00"
    )
    params = {"keywordSearch": vendor_name, "pubStartDate": start, "resultsPerPage": 100}
    headers = {}
    if api_key:
        headers["apiKey"] = api_key
    else:
        time.sleep(NVD_DELAY)

    try:
        r = requests.get(NVD_BASE_URL, params=params, headers=headers, timeout=30)
        r.raise_for_status()
        vulns = r.json().get("vulnerabilities", [])
        results = []
        for v in vulns:
            cve = v.get("cve", {})
            metrics = cve.get("metrics", {})
            cvss_data = (
                metrics.get("cvssMetricV31", [{}])[0].get("cvssData", {}) or
                metrics.get("cvssMetricV30", [{}])[0].get("cvssData", {}) or
                metrics.get("cvssMetricV2",  [{}])[0].get("cvssData", {})
            )
            results.append({
                "id": cve.get("id", ""),
                "severity": cvss_data.get("baseSeverity", "UNKNOWN"),
                "score": cvss_data.get("baseScore", 0),
            })
        return results
    except Exception as e:
        print(f"[WARN] NVD fetch failed for {vendor_name}: {e}")
        return []


# ── News signal ───────────────────────────────────────────
def fetch_news_signal(vendor_name, api_key=NEWS_API_KEY):
    if not api_key:
        return 0, []
    try:
        r = requests.get(NEWS_BASE_URL, params={
            "q": f'"{vendor_name}" AND (breach OR vulnerability OR exploit OR "zero day")',
            "from": (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d"),
            "language": "en", "sortBy": "relevancy", "pageSize": 5, "apiKey": api_key,
        }, timeout=20)
        r.raise_for_status()
        articles = r.json().get("articles", [])
        return len(articles), [a.get("title", "") for a in articles[:3]]
    except Exception as e:
        print(f"[WARN] News fetch failed for {vendor_name}: {e}")
        return 0, []


# ── Main ──────────────────────────────────────────────────
def main():
    with open(VENDORS_PATH) as f:
        data = json.load(f)

    kev_set = fetch_kev_set()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    changes = []

    for vendor in data["vendors"]:
        vid = vendor["id"]
        name = vendor["name"]
        prev = {k: vendor.get(k) for k in ["cves_12m", "critical_count", "kev_count", "grade", "score"]}

        nvd_cves = fetch_nvd_cves(name)
        if nvd_cves:
            vendor["cves_12m"] = len(nvd_cves)
            vendor["critical_count"] = sum(1 for c in nvd_cves if c["severity"] == "CRITICAL")

        vendor_kev_cves = [c["id"] for c in vendor.get("cve_list", []) if c["id"] in kev_set]
        vendor["kev_count"] = len(vendor_kev_cves)

        new_score, new_grade = compute_score(vendor)
        vendor["score"] = new_score
        vendor["grade"] = new_grade

        news_count, news_titles = fetch_news_signal(name)
        news_flag = news_count >= 3

        curr = {k: vendor.get(k) for k in ["cves_12m", "critical_count", "kev_count", "grade", "score"]}
        diffs = {k: (prev[k], curr[k]) for k in curr if prev.get(k) != curr.get(k)}

        if diffs or news_flag:
            changes.append({"vendor": name, "id": vid, "diffs": diffs, "news_flag": news_flag, "news_titles": news_titles})
            print(f"[CHANGED] {name}: {diffs}")

    data["_meta"]["last_updated"] = today
    with open(VENDORS_PATH, "w") as f:
        json.dump(data, f, indent=2)

    write_pr_body(changes, today)
    print(f"Done. {len(changes)} vendors changed.")


def write_pr_body(changes, today):
    lines = [
        f"## Daily vendor data update — {today}", "",
        "**Automated pipeline** · NVD API + CISA KEV · No editorial fields were modified.", "",
        "> Review each change below. Merge to publish. Close to skip.", "",
    ]
    data_changes = [c for c in changes if c["diffs"]]
    news_flags = [c for c in changes if c["news_flag"]]

    if data_changes:
        lines += ["### Data changes", ""]
        for c in data_changes:
            lines.append(f"**{c['vendor']}**")
            for field, (old, new) in c["diffs"].items():
                arrow = "↑" if isinstance(new, (int, float)) and isinstance(old, (int, float)) and new > old else "↓" if isinstance(new, (int, float)) and isinstance(old, (int, float)) and new < old else "→"
                lines.append(f"- `{field}`: {old} {arrow} **{new}**")
            lines.append("")

    if news_flags:
        lines += ["---", "### News signals — may warrant WR editorial review", ""]
        for c in news_flags:
            lines.append(f"**{c['vendor']}** — {len(c['news_titles'])} recent articles flagged")
            for title in c["news_titles"]:
                lines.append(f"  - {title}")
            lines.append("")
        lines += ["> These are signals only. Pipeline has NOT modified editorial fields.", ""]

    if not changes:
        lines += ["### No changes detected", "", "All vendor data matches current feeds.", ""]

    lines += [
        "---", "### Protected fields — not touched by this PR",
        "`wr_featured` · `wr_take` · `rrr_react` · `rrr_respond` · `rrr_resilient` · `serial`", "",
        f"[NVD](https://nvd.nist.gov) · [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) · Generated {today}",
    ]
    with open(PR_BODY_PATH, "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
