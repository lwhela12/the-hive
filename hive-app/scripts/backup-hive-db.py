#!/usr/bin/env python3
"""Weekly HIVE database backup.

Dumps every public table to a dated JSON file in ~/Documents/HIVE-backups
(iCloud-synced), keeping the 8 most recent snapshots. Scheduled via cron.

Credentials: SUPABASE_SERVICE_ROLE_KEY from hive-app/.env (data access) and the
Supabase personal access token from the macOS keychain (table discovery).
No secrets are stored in this script.
"""
import datetime
import json
import os
import pathlib
import subprocess
import urllib.request

REPO_ENV = pathlib.Path(__file__).resolve().parent.parent / ".env"
PROJECT_REF = "cpfvnfcjhoeowdcexppi"
SUPA = f"https://{PROJECT_REF}.supabase.co"
BACKUP_DIR = pathlib.Path.home() / "Documents" / "HIVE-backups"
KEEP_SNAPSHOTS = 8
PAGE_SIZE = 1000

def service_key():
    for line in REPO_ENV.read_text().splitlines():
        if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            return line.split("=", 1)[1].split()[0].strip()
    raise RuntimeError("service role key not found in .env")

def management_token():
    return subprocess.run(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

def list_tables(token):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": "hive-backup/1.0"},
        data=json.dumps({
            "query": "select table_name from information_schema.tables "
                     "where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
        }).encode(),
    )
    return [row["table_name"] for row in json.load(urllib.request.urlopen(req))]

def dump_table(key, table):
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(
            f"{SUPA}/rest/v1/{table}?select=*&order=ctid&limit={PAGE_SIZE}&offset={offset}",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "User-Agent": "hive-backup/1.0"},
        )
        try:
            page = json.load(urllib.request.urlopen(req))
        except Exception as e:  # e.g. tables REST can't order by ctid on
            if offset == 0:
                req = urllib.request.Request(
                    f"{SUPA}/rest/v1/{table}?select=*&limit={PAGE_SIZE}&offset={offset}",
                    headers={"apikey": key, "Authorization": f"Bearer {key}", "User-Agent": "hive-backup/1.0"},
                )
                page = json.load(urllib.request.urlopen(req))
            else:
                raise e
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE

def main():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    key = service_key()
    tables = list_tables(management_token())
    snapshot = {"taken_at": datetime.datetime.now().isoformat(), "tables": {}}
    for table in tables:
        try:
            snapshot["tables"][table] = dump_table(key, table)
        except Exception as e:
            snapshot["tables"][table] = {"error": str(e)}
            print(f"  warn: {table}: {e}")
    stamp = datetime.date.today().isoformat()
    out = BACKUP_DIR / f"hive-backup-{stamp}.json"
    out.write_text(json.dumps(snapshot, indent=1, default=str))
    total = sum(len(v) for v in snapshot["tables"].values() if isinstance(v, list))
    print(f"backed up {len(tables)} tables, {total} rows -> {out}")

    snapshots = sorted(BACKUP_DIR.glob("hive-backup-*.json"))
    for old in snapshots[:-KEEP_SNAPSHOTS]:
        old.unlink()
        print(f"pruned old snapshot {old.name}")

if __name__ == "__main__":
    main()
