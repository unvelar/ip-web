"""Generate compact SVG country paths from Natural Earth 1:110m GeoJSON.

Source (public domain): https://github.com/nvkelso/natural-earth-vector
Usage: python3 scripts/generate-country-map.py /path/to/ne_110m_admin_0_countries.geojson
Equirectangular projection, cropped below 60 S (Antarctica omitted).
"""
import json
import sys
from pathlib import Path

features = json.loads(Path(sys.argv[1]).read_text())["features"]
countries = []
for feature in features:
    props = feature["properties"]
    if props["NAME_EN"] == "Antarctica":
        continue
    geom = feature["geometry"]
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    paths = []
    for polygon in polygons:
        for ring in polygon:
            points = [f"{(lon + 180) * 2.5:.1f},{(85 - lat) * 2.5:.1f}" for lon, lat in ring]
            paths.append("M" + "L".join(points) + "Z")
    countries.append({"name": props["NAME_EN"], "code": props["ISO_A2_EH"], "path": "".join(paths)})
Path("src/data/worldCountries.json").write_text(json.dumps(countries, separators=(",", ":")) + "\n")
