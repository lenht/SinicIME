#!/usr/bin/env python3
"""
Exports imenom.db (rubynom, cmpnom tables) to imenom.json.

Default output is human-readable: each row is a JSON object with named
fields (not a positional array), one row per line, so the file can be
opened, diffed, and grepped directly — e.g. `grep '"ruby": "a"'` finds
every rubynom row for that ruby at a glance.

    python3 export_imenom_json.py imenom.db imenom.json

For deployment, use --compact: the same data as minified flat arrays
(no field names, no whitespace). This is what should actually ship to
the live site — smaller on the wire and faster to JSON.parse. See
DATA_LAYER_MIGRATION.md for the size/speed comparison between the two.

    python3 export_imenom_json.py imenom.db imenom.json --compact

imedata.js accepts either shape — it normalizes both into the same
internal array form before building its indexes (see IMEData.normalize
in imedata.js), so no other file needs to know which one it's reading.

Ordering: both SELECTs use explicit ORDER BY rowid. This isn't strictly
necessary for an unindexed full-table scan (SQLite returns rowid order by
default in that case), but it costs nothing and removes any ambiguity per
the project's "always add explicit ordering" convention.
"""
import sqlite3
import json
import os
import sys


def fetch_rows(src):
    conn = sqlite3.connect(src)
    c = conn.cursor()

    # NOTE on a known data quirk: one row in cmpnom.crubynom ("嫗:姬" ->
    # "\ufeffÂu Cơ") has a stray embedded U+FEFF (BOM) from some past
    # data-entry step. SQLite's own '='/LIKE matching compares raw bytes
    # (BOM included), so that row is currently unreachable in production
    # via a ruby-side compound search for "Âu ..." — confirmed directly
    # against imenom.db. sql.js's JS-side UTF-8 decoder *does* silently
    # drop a leading BOM when handing a value back as a JS string, so the
    # row displays cleanly whenever it IS returned (e.g. via the cword
    # direction). We export the raw bytes as-is here (matching must stay
    # byte-accurate) and replicate the display-side stripping in
    # imedata.js instead. See DATA_LAYER_MIGRATION.md.

    c.execute("SELECT word, ruby, level FROM rubynom ORDER BY rowid")
    rubynom = c.fetchall()  # [(word, ruby, level), ...]

    c.execute("SELECT cword, crubynom FROM cmpnom ORDER BY rowid")
    cmpnom = c.fetchall()  # [(cword, crubynom), ...]

    return rubynom, cmpnom


def write_compact(out, rubynom, cmpnom):
    data = {
        "rubynom": [[w, r, l] for w, r, l in rubynom],
        "cmpnom": [[cw, cr] for cw, cr in cmpnom],
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def write_readable(out, rubynom, cmpnom):
    def row_json(obj):
        # One row, one line, named fields — compact enough to scan a
        # screenful at a time, but self-describing without cross-
        # referencing imedata.js to know what each position means.
        return json.dumps(obj, ensure_ascii=False)

    with open(out, "w", encoding="utf-8") as f:
        f.write("{\n")

        f.write('  "rubynom": [\n')
        for i, (w, r, l) in enumerate(rubynom):
            comma = "," if i < len(rubynom) - 1 else ""
            f.write("    " + row_json({"word": w, "ruby": r, "level": l}) + comma + "\n")
        f.write("  ],\n")

        f.write('  "cmpnom": [\n')
        for i, (cw, cr) in enumerate(cmpnom):
            comma = "," if i < len(cmpnom) - 1 else ""
            f.write("    " + row_json({"cword": cw, "crubynom": cr}) + comma + "\n")
        f.write("  ]\n")

        f.write("}\n")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    compact = "--compact" in sys.argv

    if len(args) != 2:
        print("Usage: python3 export_imenom_json.py <imenom.db> <output.json> [--compact]")
        sys.exit(1)
    src, out = args

    rubynom, cmpnom = fetch_rows(src)

    if compact:
        write_compact(out, rubynom, cmpnom)
    else:
        write_readable(out, rubynom, cmpnom)

    print(f"rubynom: {len(rubynom)} rows, cmpnom: {len(cmpnom)} rows")
    print(f"Format: {'compact (flat arrays)' if compact else 'readable (named fields)'}")
    print(f"Output: {out} ({os.path.getsize(out):,} bytes)")


if __name__ == "__main__":
    main()
