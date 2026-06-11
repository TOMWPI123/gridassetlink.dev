from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter

router = APIRouter(prefix="/api/live-status", tags=["live-status"])

INTEL_QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/INTC?range=1d&interval=5m"
NBA_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
HTTP_TIMEOUT_SECONDS = 8


def _fetch_json(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "GridAssetLink synthetic planning demo/0.1",
        },
    )
    with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _iso_from_epoch(epoch_seconds: Any) -> str | None:
    if not isinstance(epoch_seconds, (int, float)):
        return None
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def _fetch_intel_stock() -> dict[str, Any]:
    source = {
        "source": "Yahoo Finance public chart feed",
        "source_url": INTEL_QUOTE_URL,
    }
    try:
        payload = _fetch_json(INTEL_QUOTE_URL)
        result = (payload.get("chart", {}).get("result") or [None])[0] or {}
        meta = result.get("meta", {})
        price = meta.get("regularMarketPrice")
        previous_close = meta.get("previousClose") or meta.get("chartPreviousClose")
        change = None
        change_percent = None
        if isinstance(price, (int, float)) and isinstance(previous_close, (int, float)) and previous_close:
            change = round(price - previous_close, 4)
            change_percent = round((change / previous_close) * 100, 4)
        return {
            **source,
            "symbol": "INTC",
            "name": meta.get("longName") or meta.get("shortName") or "Intel Corporation",
            "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "NASDAQ",
            "currency": meta.get("currency") or "USD",
            "price": price,
            "previous_close": previous_close,
            "change": change,
            "change_percent": change_percent,
            "as_of": _iso_from_epoch(meta.get("regularMarketTime")),
            "status": "live" if isinstance(price, (int, float)) else "unavailable",
        }
    except (KeyError, TypeError, ValueError, URLError, TimeoutError, OSError) as exc:
        return {
            **source,
            "symbol": "INTC",
            "name": "Intel Corporation",
            "exchange": "NASDAQ",
            "currency": "USD",
            "price": None,
            "previous_close": None,
            "change": None,
            "change_percent": None,
            "as_of": None,
            "status": "unavailable",
            "message": f"Public quote feed unavailable: {exc}",
        }


def _event_datetime(event: dict[str, Any]) -> datetime | None:
    raw_date = event.get("date")
    if not isinstance(raw_date, str):
        return None
    try:
        return datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
    except ValueError:
        return None


def _competitor_by_home_away(competitors: list[dict[str, Any]], home_away: str) -> dict[str, Any]:
    return next((row for row in competitors if row.get("homeAway") == home_away), {})


def _normalize_nba_event(event: dict[str, Any], source_url: str) -> dict[str, Any]:
    competition = (event.get("competitions") or [None])[0] or {}
    competitors = competition.get("competitors") or []
    home = _competitor_by_home_away(competitors, "home")
    away = _competitor_by_home_away(competitors, "away")
    home_team = home.get("team") or {}
    away_team = away.get("team") or {}
    status = event.get("status", {}).get("type", {})
    status_state = status.get("state") or "unknown"
    return {
        "source": "ESPN public NBA scoreboard",
        "source_url": source_url,
        "league": "NBA",
        "season_type": "postseason",
        "status": status_state,
        "status_detail": status.get("detail") or status.get("shortDetail") or status.get("description"),
        "game_date": event.get("date"),
        "short_name": event.get("shortName") or event.get("name"),
        "home_team": home_team.get("displayName") or home_team.get("shortDisplayName"),
        "away_team": away_team.get("displayName") or away_team.get("shortDisplayName"),
        "home_abbreviation": home_team.get("abbreviation"),
        "away_abbreviation": away_team.get("abbreviation"),
        "home_score": home.get("score"),
        "away_score": away.get("score"),
        "venue": (competition.get("venue") or {}).get("fullName"),
        "series_summary": (competition.get("series") or {}).get("summary"),
    }


def _fetch_nba_postseason_game() -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    start = (today - timedelta(days=14)).strftime("%Y%m%d")
    end = (today + timedelta(days=14)).strftime("%Y%m%d")
    source_url = f"{NBA_SCOREBOARD_URL}?seasontype=3&limit=100&dates={start}-{end}"
    try:
        payload = _fetch_json(source_url)
        events = [event for event in payload.get("events", []) if _event_datetime(event)]
        now = datetime.now(timezone.utc)
        in_progress = [event for event in events if event.get("status", {}).get("type", {}).get("state") == "in"]
        upcoming = [event for event in events if (_event_datetime(event) or now) >= now and event.get("status", {}).get("type", {}).get("state") == "pre"]
        completed = [event for event in events if event.get("status", {}).get("type", {}).get("state") == "post"]
        if in_progress:
            selected = min(in_progress, key=lambda event: abs(((_event_datetime(event) or now) - now).total_seconds()))
        elif upcoming:
            selected = min(upcoming, key=lambda event: _event_datetime(event) or now)
        elif completed:
            selected = max(completed, key=lambda event: _event_datetime(event) or now)
        else:
            selected = max(events, key=lambda event: _event_datetime(event) or now)
        return _normalize_nba_event(selected, source_url)
    except (KeyError, TypeError, ValueError, URLError, TimeoutError, OSError) as exc:
        return {
            "source": "ESPN public NBA scoreboard",
            "source_url": source_url,
            "league": "NBA",
            "season_type": "postseason",
            "status": "unavailable",
            "status_detail": f"Public scoreboard unavailable: {exc}",
            "game_date": None,
            "short_name": "NBA postseason",
            "home_team": None,
            "away_team": None,
            "home_abbreviation": None,
            "away_abbreviation": None,
            "home_score": None,
            "away_score": None,
            "venue": None,
            "series_summary": None,
        }


@router.get("/topline")
def live_status_topline() -> dict[str, Any]:
    return {
        "intel": _fetch_intel_stock(),
        "nba": _fetch_nba_postseason_game(),
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
