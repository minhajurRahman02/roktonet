#!/usr/bin/env python3
"""
Stage 6B / B10a — District centroid coordinates.

    python3 scripts/build_district_centroids.py

Reads:  raw/reference/geoboundaries_bgd_adm2_simplified.geojson
        raw/reference/districts.csv
Writes: raw/reference/district_centroids.csv

WHY THIS EXISTS
---------------
The weather fetch (scripts/fetch_weather.py) needs one (lat, lon) per district to
query NASA POWER. Coordinates are DATA, so the project rule applies: no numeric
value enters this dataset without a source. Typing 64 lat/lon pairs from memory
or from an LLM would be exactly the fabrication this repo has avoided everywhere
else, and it would be undetectable downstream — a centroid 60 km out still
returns plausible rainfall.

So the coordinates are DERIVED, by arithmetic, from a published boundary file:

    geoBoundaries v6, Bangladesh ADM2 (district), gbOpen release, simplified.
    William & Mary geoLab. CC BY 4.0.
    https://www.geoboundaries.org/
    raw/reference/geoboundaries_bgd_adm2_simplified.geojson
    sha256 7dbdb186f3b8af10417147a99859196fcd89c619fb5c6ac3804251fb6b449b6a

The file is committed, so this script is reproducible offline and the centroids
can be recomputed and checked by anyone marking the report.

WHY PURE PYTHON AND NOT geopandas
----------------------------------
geopandas pulls in GDAL/PROJ/shapely — a heavy, frequently-broken install for one
arithmetic operation. The area-weighted polygon centroid is the shoelace formula,
about 30 lines, and it is written out here so the calculation is auditable rather
than hidden behind a dependency.

PLANAR APPROXIMATION, AND WHY IT IS FINE HERE
----------------------------------------------
Centroids are computed in degrees, treating lon/lat as a plane. That is formally
wrong — degrees of longitude shorten with latitude. Across Bangladesh's ~6 degrees
of latitude the induced error is a few hundred metres.

That is irrelevant at the resolution that matters: NASA POWER serves a 0.5 deg x
0.625 deg grid, roughly 55 km x 70 km. Most Bangladeshi districts are smaller
than one grid cell. The centroid's job is only to select the right cell, and a
sub-kilometre error cannot change which cell is selected except for a district
already sitting on a cell boundary, where either neighbouring cell is an equally
defensible representation of that district's weather.

CONCAVE DISTRICTS
-----------------
The area centroid of a concave or multi-part polygon can fall OUTSIDE the
polygon — a real risk for the coastal and riverine districts here. Every centroid
is therefore point-in-polygon tested against its own geometry, and any that falls
outside is replaced by an interior point: the midpoint of the widest interior
span on a horizontal scanline through the centroid's latitude. Which districts
needed this is printed, not hidden.

NAME MAPPING
------------
geoBoundaries uses pre-2018 English spellings for nine districts. Bangladesh
officially respelled several of them (Barisal -> Barishal, Comilla -> Cumilla,
Chittagong -> Chattogram, Jessore -> Jashore); the rest are transliteration
variants. The mapping is explicit below rather than fuzzy-matched, for the same
reason the Bangla mapping is explicit in district_name_variants.yaml: automatic
folding merged two real districts there, and a silent merge here would give one
district another's weather.

The script FAILS if the mapping does not resolve to exactly the 64 districts in
districts.csv, in both directions. There is no partial success.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GEOJSON = REPO / "raw" / "reference" / "geoboundaries_bgd_adm2_simplified.geojson"
DISTRICTS = REPO / "raw" / "reference" / "districts.csv"
OUT = REPO / "raw" / "reference" / "district_centroids.csv"

# geoBoundaries shapeName -> this dataset's canonical district name.
# Only the nine that differ are listed; the other 55 match exactly.
NAME_MAP = {
    "Barisal": "Barishal",            # official respelling, 2018
    "Bogra": "Bogura",                # official respelling, 2018
    "Chittagong": "Chattogram",       # official respelling, 2018
    "Comilla": "Cumilla",             # official respelling, 2018
    "Jessore": "Jashore",             # official respelling, 2018
    "Brahamanbaria": "Brahmanbaria",  # transliteration variant
    "Maulvibazar": "Moulvibazar",     # transliteration variant
    "Netrakona": "Netrokona",         # transliteration variant
    "Nawabganj": "Chapai Nawabganj",  # short form of Chapai Nawabganj
}

# Bangladesh's national bounding box, used as a sanity envelope.
LON_MIN, LON_MAX = 88.0, 92.7
LAT_MIN, LAT_MAX = 20.5, 26.7


def ring_area_centroid(ring: list) -> tuple[float, float, float]:
    """Signed area and area centroid of one closed ring, by the shoelace formula.

    Returns (signed_area, cx, cy). Sign encodes winding direction, which is how
    interior holes subtract themselves from the enclosing polygon without any
    special-casing.
    """
    a = cx = cy = 0.0
    n = len(ring)
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a *= 0.5
    if abs(a) < 1e-15:
        return 0.0, 0.0, 0.0
    return a, cx / (6.0 * a), cy / (6.0 * a)


def polygons_of(geom: dict) -> list:
    """Normalise Polygon / MultiPolygon to a list of polygons (list of rings)."""
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return list(geom["coordinates"])
    raise ValueError(f"unsupported geometry type {t}")


def centroid_of(geom: dict) -> tuple[float, float]:
    """Area-weighted centroid across all parts and rings. Holes subtract."""
    tot = sx = sy = 0.0
    for poly in polygons_of(geom):
        for ring in poly:
            a, cx, cy = ring_area_centroid(ring)
            tot += a
            sx += a * cx
            sy += a * cy
    if abs(tot) < 1e-15:
        raise ValueError("degenerate geometry, zero area")
    return sx / tot, sy / tot          # lon, lat


def point_in_ring(x: float, y: float, ring: list) -> bool:
    """Standard even-odd ray cast."""
    inside = False
    n = len(ring)
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        if (y0 > y) != (y1 > y):
            xi = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < xi:
                inside = not inside
    return inside


def point_in_geom(x: float, y: float, geom: dict) -> bool:
    for poly in polygons_of(geom):
        if point_in_ring(x, y, poly[0]) and not any(
                point_in_ring(x, y, h) for h in poly[1:]):
            return True
    return False


def interior_point(geom: dict, lat: float) -> tuple[float, float]:
    """Midpoint of the widest interior span on the horizontal line y = lat.

    Used only when the area centroid falls outside its own polygon. Collects
    every edge crossing of that latitude across all parts and holes, sorts them,
    and takes the midpoint of the widest span whose midpoint tests as interior.
    """
    xs: list[float] = []
    for poly in polygons_of(geom):
        for ring in poly:
            n = len(ring)
            for i in range(n - 1):
                x0, y0 = ring[i][0], ring[i][1]
                x1, y1 = ring[i + 1][0], ring[i + 1][1]
                if (y0 > lat) != (y1 > lat):
                    xs.append(x0 + (lat - y0) * (x1 - x0) / (y1 - y0))
    xs.sort()
    best_w, best_x = -1.0, None
    for i in range(len(xs) - 1):
        mid = (xs[i] + xs[i + 1]) / 2.0
        w = xs[i + 1] - xs[i]
        if w > best_w and point_in_geom(mid, lat, geom):
            best_w, best_x = w, mid
    if best_x is None:
        raise ValueError("no interior span found on the scanline")
    return best_x, lat


def main() -> None:
    for p in (GEOJSON, DISTRICTS):
        if not p.exists():
            sys.exit(f"FATAL: {p} not found.")

    canonical = {}
    with DISTRICTS.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            canonical[r["district"]] = r["division"]
    if len(canonical) != 64:
        sys.exit(f"FATAL: districts.csv has {len(canonical)} districts, expected 64")

    gj = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = gj["features"]
    print(f"geoBoundaries ADM2 features: {len(feats)}")

    rows, unmatched, fixed = [], [], []
    seen = set()
    for f in feats:
        raw_name = f["properties"]["shapeName"]
        name = NAME_MAP.get(raw_name, raw_name)
        if name not in canonical:
            unmatched.append(raw_name)
            continue
        if name in seen:
            sys.exit(f"FATAL: '{name}' produced by two features. Mapping is wrong.")
        seen.add(name)

        geom = f["geometry"]
        lon, lat = centroid_of(geom)
        method = "area_centroid"
        if not point_in_geom(lon, lat, geom):
            lon, lat = interior_point(geom, lat)
            method = "interior_point"
            fixed.append(name)

        if not (LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX):
            sys.exit(f"FATAL: {name} centroid ({lat:.4f},{lon:.4f}) is outside "
                     f"Bangladesh's bounding box.")

        rows.append({"district": name, "division": canonical[name],
                     "latitude": round(lat, 4), "longitude": round(lon, 4),
                     "method": method, "source_shape_name": raw_name})

    # ---- both-directions completeness. No partial success. ----
    if unmatched:
        print("\nUNMATCHED geoBoundaries names:", file=sys.stderr)
        for u in sorted(unmatched):
            print("   ", u, file=sys.stderr)
        sys.exit("FATAL: add these to NAME_MAP.")
    missing = set(canonical) - seen
    if missing:
        print("\nDISTRICTS WITH NO GEOMETRY:", file=sys.stderr)
        for m in sorted(missing):
            print("   ", m, file=sys.stderr)
        sys.exit("FATAL: every district must get a centroid.")

    rows.sort(key=lambda r: r["district"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["district", "division", "latitude",
                                           "longitude", "method",
                                           "source_shape_name"])
        w.writeheader()
        w.writerows(rows)

    lats = [r["latitude"] for r in rows]
    lons = [r["longitude"] for r in rows]
    print(f"\nwrote {OUT}  ({len(rows)} districts)")
    print(f"  latitude  range : {min(lats):.4f} .. {max(lats):.4f}")
    print(f"  longitude range : {min(lons):.4f} .. {max(lons):.4f}")
    print(f"  renamed via NAME_MAP        : {len(NAME_MAP)}")
    print(f"  area centroid outside shape : {len(fixed)}"
          + (f"  -> interior point used for {', '.join(sorted(fixed))}" if fixed else ""))
    print(f"  all 64 districts matched, no duplicates  (PASS)")


if __name__ == "__main__":
    main()
