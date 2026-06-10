from __future__ import annotations

import argparse
import json
import math
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib import error, parse, request


VECTOR_TILE_MIME = "application/vnd.mapbox-vector-tile"
DEFAULT_CENTER_LON = -71.75
DEFAULT_CENTER_LAT = 42.25
REQUIRED_TILE_LAYERS = (
    "territory",
    "poles",
    "pole_clusters",
    "spans",
    "fiber_routes",
    "splice_cases",
    "handholes",
    "slack_loops",
    "mux_sites",
    "circuit_routes",
)
REQUIRED_TILE_HEADERS = (
    "Cache-Control",
    "ETag",
    "X-GIS-LOD",
    "X-GIS-Feature-Count",
    "X-GIS-Max-Features",
    "X-GIS-Tile-Truncated",
)


@dataclass(frozen=True)
class TileCheck:
    name: str
    layer: str
    z: int
    x: int
    y: int
    expected_lod: str | None = None
    budget_ms: int = 1000

    @property
    def path(self) -> str:
        return f"/api/tiles/{self.layer}/{self.z}/{self.x}/{self.y}.mvt"


@dataclass
class CheckResult:
    name: str
    method: str
    path: str
    status_code: int | None
    latency_ms: float
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    response_bytes: int = 0
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class HttpResult:
    status_code: int
    headers: dict[str, str]
    body: bytes
    latency_ms: float


def required_tile_layers() -> tuple[str, ...]:
    return REQUIRED_TILE_LAYERS


def required_tile_headers() -> tuple[str, ...]:
    return REQUIRED_TILE_HEADERS


def lon_lat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    lat = max(min(lat, 85.05112878), -85.05112878)
    lat_rad = math.radians(lat)
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def representative_tile_checks(
    center_lon: float = DEFAULT_CENTER_LON,
    center_lat: float = DEFAULT_CENTER_LAT,
    tile_budget_ms: int = 1000,
) -> list[TileCheck]:
    specs: list[tuple[str, int, str | None, str]] = [
        ("territory", 7, None, "territory-boundary"),
        ("poles", 8, "density", "pole-density-z8"),
        ("poles", 12, "cluster", "pole-clusters-z12"),
        ("poles", 16, "individual", "pole-detail-z16"),
        ("pole_clusters", 12, None, "pole-cluster-layer-z12"),
        ("spans", 11, "simplified", "span-simplified-z11"),
        ("spans", 15, "detail", "span-detail-z15"),
        ("fiber_routes", 10, None, "fiber-route-summary-z10"),
        ("fiber_routes", 13, None, "fiber-route-detail-z13"),
        ("splice_cases", 16, None, "splice-cases-z16"),
        ("handholes", 16, None, "handholes-z16"),
        ("slack_loops", 16, None, "slack-loops-z16"),
        ("mux_sites", 14, None, "mux-sites-z14"),
        ("circuit_routes", 10, None, "circuit-routes-z10"),
    ]
    checks: list[TileCheck] = []
    for layer, z, expected_lod, name in specs:
        x, y = lon_lat_to_tile(center_lon, center_lat, z)
        checks.append(TileCheck(name=name, layer=layer, z=z, x=x, y=y, expected_lod=expected_lod, budget_ms=tile_budget_ms))
    return checks


def join_api_url(base_url: str, endpoint: str) -> str:
    parsed = parse.urlsplit(base_url.rstrip("/"))
    base_path = parsed.path.rstrip("/")
    normalized_endpoint = "/" + endpoint.lstrip("/")
    if base_path.endswith("/api") and normalized_endpoint.startswith("/api/"):
        normalized_endpoint = normalized_endpoint.removeprefix("/api")
    path = f"{base_path}{normalized_endpoint}" or "/"
    return parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def run_performance_checks(
    base_url: str,
    *,
    tile_budget_ms: int = 1000,
    search_budget_ms: int = 1000,
    trace_budget_ms: int = 2000,
    timeout_seconds: int = 15,
    max_tile_bytes: int = 1_500_000,
    center_lon: float = DEFAULT_CENTER_LON,
    center_lat: float = DEFAULT_CENTER_LAT,
) -> dict[str, Any]:
    results: list[CheckResult] = []
    results.append(_check_capabilities(base_url, timeout_seconds))
    for tile_check in representative_tile_checks(center_lon, center_lat, tile_budget_ms):
        results.append(_check_tile(base_url, tile_check, timeout_seconds, max_tile_bytes))
    results.append(_check_search(base_url, timeout_seconds, search_budget_ms))
    results.append(_check_trace(base_url, timeout_seconds, trace_budget_ms))

    failed = [result for result in results if not result.ok]
    warning_count = sum(len(result.warnings) for result in results)
    return {
        "ok": not failed,
        "base_url": base_url,
        "summary": {
            "check_count": len(results),
            "failed_count": len(failed),
            "warning_count": warning_count,
            "max_latency_ms": max((result.latency_ms for result in results), default=0),
        },
        "results": [asdict(result) for result in results],
        "scale_contract": {
            "raw_browser_pole_load_allowed": False,
            "full_dataset_geojson_allowed": False,
            "server_side_vector_tiles_required": True,
            "server_side_search_required": True,
            "server_side_trace_required": True,
            "individual_pole_zoom_min": 16,
        },
    }


def _check_capabilities(base_url: str, timeout_seconds: int) -> CheckResult:
    path = "/api/gis/capabilities"
    result = _send(base_url, "GET", path, timeout_seconds=timeout_seconds)
    check = _result_shell("gis-capabilities", "GET", path, result)
    if result.status_code != 200:
        check.errors.append(f"Expected HTTP 200, got {result.status_code}.")
    payload = _json_body(result.body)
    if not isinstance(payload, dict):
        check.errors.append("Capabilities response was not JSON.")
    else:
        missing_layers = sorted(set(REQUIRED_TILE_LAYERS) - set(payload.get("layers", [])))
        if missing_layers:
            check.errors.append(f"Capabilities missing required tile layers: {', '.join(missing_layers)}.")
        if "Do not fetch raw pole inventories into browser state." not in payload.get("client_rules", []):
            check.warnings.append("Capabilities response does not explicitly repeat the raw-pole browser guardrail.")
    check.ok = not check.errors
    return check


def _check_tile(base_url: str, tile_check: TileCheck, timeout_seconds: int, max_tile_bytes: int) -> CheckResult:
    result = _send(base_url, "GET", tile_check.path, timeout_seconds=timeout_seconds)
    check = _result_shell(tile_check.name, "GET", tile_check.path, result)
    if result.status_code != 200:
        check.errors.append(f"Expected HTTP 200 for vector tile, got {result.status_code}.")
    content_type = _header(result.headers, "content-type")
    if result.status_code == 200 and VECTOR_TILE_MIME not in content_type:
        check.errors.append(f"Tile response content-type should include {VECTOR_TILE_MIME}; got {content_type or 'missing'}.")
    for header in REQUIRED_TILE_HEADERS:
        if not _header(result.headers, header):
            check.errors.append(f"Missing required tile header {header}.")
    if tile_check.expected_lod:
        actual_lod = _header(result.headers, "x-gis-lod")
        if actual_lod != tile_check.expected_lod:
            check.errors.append(f"Expected X-GIS-LOD={tile_check.expected_lod}, got {actual_lod or 'missing'}.")
    if result.latency_ms > tile_check.budget_ms:
        check.errors.append(f"Tile latency {result.latency_ms:.1f}ms exceeded {tile_check.budget_ms}ms budget.")
    if len(result.body) > max_tile_bytes:
        check.errors.append(f"Tile payload {len(result.body)} bytes exceeded {max_tile_bytes} byte guardrail.")
    etag = _header(result.headers, "etag")
    if etag:
        revalidated = _send(base_url, "GET", tile_check.path, headers={"If-None-Match": etag}, timeout_seconds=timeout_seconds)
        if revalidated.status_code != 304:
            check.errors.append(f"ETag revalidation expected HTTP 304, got {revalidated.status_code}.")
    check.ok = not check.errors
    return check


def _check_search(base_url: str, timeout_seconds: int, search_budget_ms: int) -> CheckResult:
    path = "/api/search?type=pole&q=TEST&limit=25&offset=0"
    result = _send(base_url, "GET", path, timeout_seconds=timeout_seconds)
    check = _result_shell("server-side-pole-search", "GET", path, result)
    if result.status_code != 200:
        check.errors.append(f"Expected HTTP 200 for search, got {result.status_code}.")
    if result.latency_ms > search_budget_ms:
        check.errors.append(f"Search latency {result.latency_ms:.1f}ms exceeded {search_budget_ms}ms budget.")
    payload = _json_body(result.body)
    if not isinstance(payload, dict):
        check.errors.append("Search response was not JSON.")
    else:
        results = payload.get("results", [])
        if not isinstance(results, list):
            check.errors.append("Search response did not include a results list.")
        elif len(results) > 25:
            check.errors.append("Search returned more rows than requested.")
        if payload.get("search_strategy") not in {None, "indexed_columns_only"}:
            check.errors.append("Search did not report indexed-column strategy.")
    if len(result.body) > 250_000:
        check.errors.append("Search response exceeded 250KB pagination guardrail.")
    check.ok = not check.errors
    return check


def _check_trace(base_url: str, timeout_seconds: int, trace_budget_ms: int) -> CheckResult:
    path = "/api/trace/fiber"
    result = _send(
        base_url,
        "POST",
        path,
        body={"asset_id": "FIBER-SMOKE", "max_edges": 50, "max_depth": 8},
        timeout_seconds=timeout_seconds,
    )
    check = _result_shell("server-side-fiber-trace", "POST", path, result)
    if result.status_code != 200:
        check.errors.append(f"Expected HTTP 200 for trace, got {result.status_code}.")
    if result.latency_ms > trace_budget_ms:
        check.errors.append(f"Trace latency {result.latency_ms:.1f}ms exceeded {trace_budget_ms}ms budget.")
    payload = _json_body(result.body)
    if not isinstance(payload, dict):
        check.errors.append("Trace response was not JSON.")
    elif payload.get("postgis_configured") is not False:
        summary = payload.get("trace_summary", {})
        if not isinstance(summary, dict):
            check.errors.append("Trace response did not include trace_summary.")
        elif summary.get("max_edges", 0) > 50 or summary.get("max_depth", 0) > 8:
            check.errors.append("Trace response ignored max_edges/max_depth smoke-check bounds.")
        ordered_path = payload.get("ordered_path", [])
        if isinstance(ordered_path, list) and len(ordered_path) > 50:
            check.errors.append("Trace returned more edges than the requested max_edges guardrail.")
    if len(result.body) > 1_000_000:
        check.errors.append("Trace response exceeded 1MB selected-path guardrail.")
    check.ok = not check.errors
    return check


def _result_shell(name: str, method: str, path: str, result: HttpResult) -> CheckResult:
    return CheckResult(
        name=name,
        method=method,
        path=path,
        status_code=result.status_code,
        latency_ms=result.latency_ms,
        ok=False,
        response_bytes=len(result.body),
        headers={key: value for key, value in result.headers.items() if key.lower().startswith(("cache", "etag", "x-gis", "content-type"))},
    )


def _send(
    base_url: str,
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: int,
) -> HttpResult:
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    request_headers = {"Accept": "*/*", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    req = request.Request(join_api_url(base_url, path), data=payload, headers=request_headers, method=method)
    start = time.perf_counter()
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            response_body = response.read()
            elapsed_ms = (time.perf_counter() - start) * 1000
            return HttpResult(response.status, _normalize_headers(dict(response.headers.items())), response_body, elapsed_ms)
    except error.HTTPError as exc:
        response_body = exc.read()
        elapsed_ms = (time.perf_counter() - start) * 1000
        return HttpResult(exc.code, _normalize_headers(dict(exc.headers.items())), response_body, elapsed_ms)
    except Exception as exc:  # pragma: no cover - exercised by failed live connectivity.
        elapsed_ms = (time.perf_counter() - start) * 1000
        body_bytes = json.dumps({"error": str(exc)}).encode("utf-8")
        return HttpResult(0, {}, body_bytes, elapsed_ms)


def _json_body(body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        return None


def _normalize_headers(headers: dict[str, str]) -> dict[str, str]:
    return {key.lower(): value for key, value in headers.items()}


def _header(headers: dict[str, str], name: str) -> str:
    return headers.get(name.lower(), "")


def _print_human_report(report: dict[str, Any]) -> None:
    status = "PASS" if report["ok"] else "FAIL"
    summary = report["summary"]
    print(f"GIS scale performance check: {status}")
    print(f"Base URL: {report['base_url']}")
    print(f"Checks: {summary['check_count']}  Failed: {summary['failed_count']}  Warnings: {summary['warning_count']}  Max latency: {summary['max_latency_ms']:.1f}ms")
    for result in report["results"]:
        marker = "OK" if result["ok"] else "FAIL"
        print(f"- {marker} {result['name']} {result['status_code']} {result['latency_ms']:.1f}ms {result['response_bytes']} bytes")
        for error_message in result["errors"]:
            print(f"  error: {error_message}")
        for warning_message in result["warnings"]:
            print(f"  warning: {warning_message}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-check GridAssetLink GIS vector tile, search, and trace performance contracts.")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL, for example http://localhost:8000 or https://gridassetlink.dev/backend")
    parser.add_argument("--tile-budget-ms", type=int, default=1000)
    parser.add_argument("--search-budget-ms", type=int, default=1000)
    parser.add_argument("--trace-budget-ms", type=int, default=2000)
    parser.add_argument("--timeout-seconds", type=int, default=15)
    parser.add_argument("--max-tile-bytes", type=int, default=1_500_000)
    parser.add_argument("--center-lon", type=float, default=DEFAULT_CENTER_LON)
    parser.add_argument("--center-lat", type=float, default=DEFAULT_CENTER_LAT)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON only.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    report = run_performance_checks(
        args.base_url,
        tile_budget_ms=args.tile_budget_ms,
        search_budget_ms=args.search_budget_ms,
        trace_budget_ms=args.trace_budget_ms,
        timeout_seconds=args.timeout_seconds,
        max_tile_bytes=args.max_tile_bytes,
        center_lon=args.center_lon,
        center_lat=args.center_lat,
    )
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        _print_human_report(report)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
