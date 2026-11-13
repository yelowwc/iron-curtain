"""Step 2 of the province build: cut every country into real provinces.

Each game land (atlas outline, hand-drawn regions cut out of their parents) is split along
Natural Earth 1:10m admin-1 borders. Over-fine countries use NE's bigger "region" grouping,
slivers that only exist because the 110m and 10m outlines disagree fold into a neighbour,
and small provinces merge into their best neighbour until each is at least MIN_KM2.

usage: python tools/build_provinces.py LANDS.json ADMIN1.geojson OUT_FEATURES.json OUT_META.json
(run via tools/build_provinces.sh, which also builds the topology)
"""
import json, math, sys
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

MIN_KM2 = float(sys.argv[5]) if len(sys.argv) > 5 else 60000
ISLAND_KEEP = 0.25                       # an island this share of MIN_KM2 stays its own province
MERGE_BY_REGION = {"GBR", "SVN", "LVA", "PHL", "UGA", "MKD", "AZE", "MLT", "ITA", "BFA", "GIN",
                   "IRL", "MWI", "THA", "VNM", "HUN", "FRA", "TUR", "PRT", "DNK", "SRB", "MNE",
                   "EST", "LTU", "BGR", "MDA", "ROU", "KHM", "LAO", "SEN", "GMB", "NOR", "SWE", "FIN"}


VN_REGIONS = {"ДђГґng BбєЇc": "Northeast Vietnam", "TГўy BбєЇc": "Northwest Vietnam", "BбєЇc Trung Bб»™": "North Central Coast",
              "Nam Trung Bб»™": "South Central Coast", "ДђГґng Nam Bб»™": "Southeast Vietnam", "TГўy NguyГЄn": "Central Highlands",
              "Дђб»“ng bбє±ng sГґng Cб»­u Long": "Mekong Delta", "Дђб»“ng bбє±ng sГґng Hб»“ng": "Red River Delta"}


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for x in getattr(g, "geoms", []) for p in polys(x)]


def unwrap(geom):
    """GeoJSON rings that cross the date line jump from 180 to -180: shift their west half by 360,
    then cut at 180 and move the overflow back, so shapely sees two honest pieces."""
    from shapely.geometry import box
    from shapely.affinity import translate
    def fix_ring(r):
        if any(abs(r[i][0] - r[i - 1][0]) > 180 for i in range(1, len(r))):
            return [[x + 360 if x < 0 else x, y] for x, y in r], True
        return r, False
    t = geom["type"]
    polys_ = geom["coordinates"] if t == "MultiPolygon" else [geom["coordinates"]]
    parts = []
    for poly in polys_:
        rings, wrapped = [], False
        for r in poly:
            rr, w = fix_ring(r)
            rings.append(rr)
            wrapped |= w
        g = clean(Polygon(rings[0], rings[1:]))
        if wrapped:
            g = unary_union([g.intersection(box(-180, -90, 180, 90)), translate(g.intersection(box(180, -90, 540, 90)), -360)])
        parts.append(g)
    return clean(unary_union(parts))


def clean(g):
    g = g if g.is_valid else make_valid(g)
    ps = [p for p in polys(g) if p.area > 1e-7]
    return unary_union(ps) if ps else Polygon()


def min_for(g):
    """Europe and the Levant are drawn bigger on players' screens and matter more: finer provinces there."""
    c = g.centroid
    if -25 <= c.x <= 45 and 34 <= c.y <= 72:
        return MIN_KM2 * 0.4
    if 100 <= c.x <= 146 and 18 <= c.y <= 46:      # Korea, Japan, Taiwan, Indochina
        return MIN_KM2 * 0.5
    return MIN_KM2


def km2(g):
    t = 0.0
    for p in polys(g):
        t += p.area * 111.32 * 111.32 * math.cos(math.radians(p.centroid.y))
    return t


def shared_km(a, b):
    try:
        x = a.boundary.intersection(b.boundary)
    except Exception:
        x = a.buffer(1e-6).boundary.intersection(b.buffer(1e-6))
    if x.is_empty:
        return 0.0
    c = x.centroid
    return x.length * 111.32 * math.sqrt((math.cos(math.radians(c.y)) ** 2 + 1) / 2)


def main():
    src = json.load(open(sys.argv[1], encoding="utf-8"))
    global src_names
    src_names = src.get("names", {})
    lands = {}
    names = {}
    for i, f in enumerate(src["lands"]):
        k = f["key"] or "_" + f["name"]
        g = unwrap(f["geometry"])
        lands[k] = unary_union([lands[k], g]) if k in lands else g
        names.setdefault(k, f["name"])
    adm = []
    for f in json.load(open(sys.argv[2], encoding="utf-8"))["features"]:
        p = f["properties"]
        g = clean(shape(f["geometry"]))
        if g.is_empty:
            continue
        a3 = p["adm0_a3"]
        if a3 in MERGE_BY_REGION and p.get("region"):
            grp, nm = a3 + ":r:" + p["region"], p["region"]
        else:
            grp, nm = p["adm1_code"], p.get("name_en") or p.get("name") or p["admin"]
        nm = VN_REGIONS.get(nm, nm)
        adm.append({"g": g, "grp": grp, "name": nm, "region": (a3, p.get("region") or ""), "area": g.area})
    tree = STRtree([a["g"] for a in adm])

    # hand-drawn regions snap to real borders: every admin-1 unit that lies mostly inside the
    # drawn ring goes to the region whole, the rest stays with the parent
    for c in src["customs"]:
        ring = clean(Polygon(c["ring"]))
        parents = [c["clip"]] if c["clip"] else [k for k in lands if lands[k].intersects(ring)]
        got = []
        for pk in parents:
            base = lands[pk]
            mine, covered = [], []
            for i in tree.query(base):
                a = adm[i]
                if not a["g"].intersects(base):
                    continue
                piece = clean(a["g"].intersection(base))
                if piece.is_empty:
                    continue
                covered.append(piece)
                if piece.intersection(ring).area >= 0.5 * piece.area:
                    mine.append(piece)
            # coast the admin-1 data does not cover goes by the ring
            bare = clean(clean(base.intersection(ring)).difference(unary_union(covered))) if covered else clean(base.intersection(ring))
            g = clean(unary_union(mine + [bare])) if mine else clean(base.intersection(ring))
            if g.is_empty:
                continue
            got.append(g)
            lands[pk] = clean(base.difference(g))
        lands[c["key"]] = clean(unary_union(got)) if got else Polygon()
        names[c["key"]] = c["key"]

    out = []                 # {key, name, g, region}
    for k, G in lands.items():
        if G.is_empty:
            continue
        native, loose = {}, []
        for i in tree.query(G):
            a = adm[i]
            if not a["g"].intersects(G):
                continue
            piece = clean(a["g"].intersection(G))
            if piece.is_empty:
                continue
            share = piece.area / a["area"]
            if share >= 0.25 or piece.area >= 0.3 * G.area:
                n = native.setdefault(a["grp"], {"name": a["name"], "parts": [], "region": a["region"]})
                n["parts"].append(piece)
            else:
                loose.append(piece)
        if not native:
            out.append({"key": k, "name": names[k], "g": G, "region": ("", "")})
            continue
        provs = [{"key": k, "name": n["name"], "g": clean(unary_union(n["parts"])), "region": n["region"]} for n in native.values()]
        # overlaps between native pieces (shouldn't happen) - later ones lose
        taken = Polygon()
        for p in provs:
            p["g"] = clean(p["g"].difference(taken))
            taken = unary_union([taken, p["g"]])
        rest = clean(G.difference(taken))
        bits = polys(rest)
        for piece in loose:
            bits += polys(clean(piece.difference(taken)))
        bits = [b for b in polys(clean(unary_union(bits))) if b.area > 1e-7]
        provs = [p for p in provs if not p["g"].is_empty]
        for b in bits:                      # slivers and coast bits go to the neighbour they share most border with
            best, bl = None, 0.0
            for p in provs:
                if p["g"].distance(b) < 1e-6:
                    l = shared_km(p["g"], b)
                    if l > bl:
                        best, bl = p, l
            if best is None:
                best = min(provs, key=lambda p: p["g"].distance(b))
            best["g"] = clean(unary_union([best["g"], b]))
        out.extend(provs)

    # merge small provinces into their best neighbour within the same land
    by_key = {}
    for p in out:
        p["km2"] = km2(p["g"])
        by_key.setdefault(p["key"], []).append(p)
    for k, ps in by_key.items():
        while len(ps) > 1:
            ps.sort(key=lambda p: p["km2"])
            small = None
            for p in ps:
                if p["km2"] >= min_for(p["g"]):
                    continue
                nb = [q for q in ps if q is not p and q["g"].distance(p["g"]) < 1e-6]
                if nb or p["km2"] < min_for(p["g"]) * ISLAND_KEEP:
                    small = p
                    break
            if small is None:
                break
            cands = [q for q in ps if q is not small]
            def score(q):                   # long shared border, same NE region, and a small partner (keeps sizes even)
                touch = shared_km(q["g"], small["g"]) if q["g"].distance(small["g"]) < 1e-6 else 0
                same = 1.6 if q["region"] == small["region"] and q["region"][1] else 1.0
                return (touch * same / math.sqrt(q["km2"] + 1), -q["g"].distance(small["g"]), -q["km2"])
            q = max(cands, key=score)
            big, sm = (q, small) if q["km2"] >= small["km2"] else (small, q)
            q["parts"] = q.get("parts", [(q["name"], q["km2"])]) + small.get("parts", [(small["name"], small["km2"])])
            q["names"] = q.get("names", [q["name"]]) + small.get("names", [small["name"]])
            q["regs"] = q.get("regs", [q["region"]]) + small.get("regs", [small["region"]])
            q["name"] = big["name"]
            q["region"] = big["region"]
            q["g"] = clean(unary_union([q["g"], small["g"]]))
            q["km2"] += small["km2"]
            q.setdefault("members", 1)
            q["members"] = q.get("members", 1) + small.get("members", 1)
            ps.remove(small)
    # a merged province is named after the NE region all its parts share, else its biggest part;
    # a country that is one province carries the country's own name
    # (or, when no part dominates, a compass name such as "Western Poland")
    LAND_WORD = {"GBR": "England", "SUN": "Russia", "YUG": "Serbia", "CSK": "Bohemia"}
    DIRS = ["Eastern", "North-Eastern", "Northern", "North-Western", "Western", "South-Western", "Southern", "South-Eastern"]
    for k, ps in by_key.items():
        land = unary_union([p["g"] for p in ps])
        lc, rad = land.centroid, math.sqrt(land.area / math.pi)
        used = set()
        for p in sorted(ps, key=lambda p: -p["km2"]):
            regs = p.get("regs", [p["region"]])
            parts = sorted(p.get("parts", [(p["name"], p["km2"])]), key=lambda x: -x[1])
            if len(ps) == 1:
                p["name"] = src_names.get(k, p["name"])
                continue
            if len(parts) == 1 or parts[0][1] >= 0.6 * p["km2"]:
                p["name"] = parts[0][0]
                continue
            if regs[0][1] and all(r == regs[0] for r in regs) and sum(1 for q in ps if q["region"] == regs[0]) == 1:
                p["name"] = regs[0][1]
                continue
            c = p["g"].representative_point() if not p["g"].centroid.within(land) else p["g"].centroid
            dx, dy = (c.x - lc.x) * math.cos(math.radians(lc.y)), c.y - lc.y
            nm = LAND_WORD.get(k, src_names.get(k, k))
            if nm.split()[0] in ("North", "South", "East", "West"):   # no "Southern South Vietnam"
                p["name"] = parts[0][0]
                used.add(p["name"])
                continue
            if math.hypot(dx, dy) < 0.3 * rad:
                cand = "Central " + nm
            else:
                cand = DIRS[int(((math.degrees(math.atan2(dy, dx)) + 360 + 22.5) % 360) // 45)] + " " + nm
            p["name"] = cand if cand not in used else parts[0][0]
            used.add(p["name"])
    final = [p for ps in by_key.values() for p in ps]
    final.sort(key=lambda p: (p["key"], -p["km2"]))
    for i, p in enumerate(final):
        p["id"] = i

    # adjacency with shared border length (km)
    t2 = STRtree([p["g"] for p in final])
    from shapely.geometry import Point
    for c in src.get("cities", []):
        pt = Point(c["lon"], c["lat"])
        hits = [final[j] for j in t2.query(pt) if final[j]["g"].contains(pt)]
        own = [h for h in hits if h["key"] == c["key"]]
        if not own:                                      # coastal capitals can sit just off the 110m coast
            own = sorted([p for p in final if p["key"] == c["key"]], key=lambda p: p["g"].distance(pt))[:1]
        if own:
            own[0].setdefault("towns", []).append(c["name"])
            if c["cap"]:
                own[0]["cap"] = 1
    meta = []
    for p in final:
        nb = {}
        for j in t2.query(p["g"].buffer(1e-5)):
            q = final[j]
            if q is p or q["g"].distance(p["g"]) > 1e-6:
                continue
            l = shared_km(p["g"], q["g"])
            if l > 1:
                nb[q["id"]] = round(l)
        c = p["g"].representative_point() if not p["g"].centroid.within(p["g"]) else p["g"].centroid
        m = {"id": p["id"], "key": p["key"], "name": p["name"], "km2": round(p["km2"]), "c": [round(c.x, 2), round(c.y, 2)], "nb": nb}
        if p.get("cap"):
            m["cap"] = 1
        if p.get("towns"):
            m["towns"] = p["towns"]
        meta.append(m)

    # d3 draws on the sphere and wants outer rings clockwise (shapely writes them anticlockwise)
    from shapely.geometry.polygon import orient
    cw = lambda g: MultiPolygon([orient(x, sign=-1.0) for x in polys(g)]) if len(polys(g)) > 1 else orient(polys(g)[0], sign=-1.0)
    feats = [{"type": "Feature", "id": p["id"], "properties": {"key": p["key"]},
              "geometry": mapping(cw(p["g"]))} for p in final]
    json.dump({"type": "FeatureCollection", "features": feats}, open(sys.argv[3], "w", encoding="utf-8"))
    json.dump(meta, open(sys.argv[4], "w", encoding="utf-8"), ensure_ascii=False)
    cnt = {}
    for p in final:
        cnt[p["key"]] = cnt.get(p["key"], 0) + 1
    top = sorted(cnt.items(), key=lambda x: -x[1])[:25]
    print("provinces", len(final), "lands", len(cnt), "most:", top)


if __name__ == "__main__":
    main()
