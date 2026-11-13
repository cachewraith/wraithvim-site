#!/usr/bin/env python3
"""Keep a running count of WraithVim clones for the page.

GitHub reports clone traffic for the last 14 days only, and only to tokens
with access to the repo's settings, so each deploy saves the daily counts in a
JSON file that outlives the 14-day window. Every CI job of the wraithvim repo
clones it too; those jobs are counted from the Actions API and subtracted, so
the total is clones by people.

Usage: TRAFFIC_TOKEN=... scripts/clones.py path/to/clones.json
Without TRAFFIC_TOKEN the file is left as it is.
"""
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.request

API = "https://api.github.com/repos/cachewraith/wraithvim"
# CI runs started late in the day can still be finishing; recount recent days.
RECOUNT_DAYS = 3


def get(path, token):
    req = urllib.request.Request(
        API + path,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ci_clones(day, token):
    """Jobs that got a runner (each checks the repo out once) in runs created on `day`."""
    count, page = 0, 1
    while True:
        runs = get(f"/actions/runs?created={day}&per_page=100&page={page}", token)["workflow_runs"]
        for run in runs:
            for attempt in range(1, run["run_attempt"] + 1):
                jobs = get(f"/actions/runs/{run['id']}/attempts/{attempt}/jobs?per_page=100", token)["jobs"]
                count += sum(1 for job in jobs if job["conclusion"] != "skipped")
        if len(runs) < 100:
            return count
        page += 1


def main(path):
    path = pathlib.Path(path)
    data = json.loads(path.read_text()) if path.exists() else {"days": {}}
    token = os.environ.get("TRAFFIC_TOKEN")
    if not token:
        print("TRAFFIC_TOKEN not set; keeping the saved clone counts")
        return
    days = data["days"]
    recount_from = (dt.date.today() - dt.timedelta(days=RECOUNT_DAYS)).isoformat()
    for entry in get("/traffic/clones", token)["clones"]:
        day = entry["timestamp"][:10]
        saved = days.setdefault(day, {})
        saved["clones"] = entry["count"]
        if entry["count"] == 0:
            saved["ci"] = 0
        elif "ci" not in saved or day >= recount_from:
            saved["ci"] = ci_clones(day, token)
    data["days"] = dict(sorted(days.items()))
    data["total"] = sum(max(0, d["clones"] - d["ci"]) for d in days.values())
    data["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"{data['total']} clones by people over {len(days)} days")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
