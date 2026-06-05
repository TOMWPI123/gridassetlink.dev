import csv
import io
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep, normalize_role, require_roles
from app.config import settings
from app.models import QRCode, SQLReport
from app.routers.crud import get_model_for_entity
from app.services.audit import add_audit_log

router = APIRouter(prefix="/api", tags=["sql and utilities"])
FORBIDDEN_SQL = re.compile(r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|call|execute|vacuum|attach|detach)\b", re.IGNORECASE)


def _is_read_query(sql_text: str) -> bool:
    cleaned = sql_text.strip().rstrip(";")
    return ";" not in cleaned and not FORBIDDEN_SQL.search(cleaned) and cleaned.lower().startswith(("select", "with", "explain"))


@router.post("/sql/select", dependencies=[Depends(require_roles("admin", "sql_analyst", "engineer"))])
def run_select_sql(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict:
    sql_text = str(payload.get("sql") or payload.get("sql_text") or "").strip()
    limit = min(max(int(payload.get("limit", 100)), 1), 1000)
    if not sql_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SQL text is required")
    if not _is_read_query(sql_text):
        if normalize_role(user.role) != "admin" or not settings.allow_admin_write_sql:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only read-only SQL is allowed")
    try:
        result = session.exec(text(f"SELECT * FROM ({sql_text.rstrip(';')}) AS telecomne_query LIMIT :limit").bindparams(limit=limit))
        rows = [dict(row._mapping) for row in result]
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    add_audit_log(session, user, "run_sql", "sql", None, new_value={"sql": sql_text, "limit": limit, "row_count": len(rows)})
    session.commit()
    return {"columns": list(rows[0].keys()) if rows else [], "rows": rows, "row_count": len(rows), "limit": limit}


@router.get("/reports/saved", dependencies=[Depends(require_roles("admin", "sql_analyst", "engineer"))])
def saved_reports(session: SessionDep, user: CurrentUser) -> list[dict]:
    role = normalize_role(user.role)
    reports = session.exec(select(SQLReport).where(SQLReport.is_active == True)).all()  # noqa: E712
    return [report.model_dump(mode="json") for report in reports if role in {normalize_role(item) for item in report.allowed_roles.split(",")}]


@router.post("/import/csv", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_csv_preview(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict:
    entity = str(payload.get("entity") or "")
    rows = payload.get("rows") or []
    allowed = {"substations", "devices", "device-ports", "icon-nodes", "fiber-cables", "fiber-strands", "patch-panels", "patch-panel-ports", "splice-closures", "circuits", "leased-services", "work-orders"}
    if entity not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported import entity")
    required = {"substations": ["substation_code", "name"], "devices": ["device_name", "device_type"], "fiber-cables": ["cable_id", "cable_type", "fiber_count"], "circuits": ["circuit_id", "circuit_name", "service_type", "ownership_type"], "work-orders": ["work_order_number", "title", "work_type"]}.get(entity, [])
    errors = [{"row": index, "missing": [field for field in required if not row.get(field)]} for index, row in enumerate(rows, start=1)]
    errors = [error for error in errors if error["missing"]]
    add_audit_log(session, user, "import_preview", entity, None, new_value={"row_count": len(rows), "errors": errors})
    session.commit()
    return {"entity": entity, "row_count": len(rows), "valid": not errors, "errors": errors, "commit_supported": False}


@router.get("/export/{entity}", dependencies=[Depends(require_roles("admin", "engineer", "sql_analyst"))])
def export_entity(entity: str, session: SessionDep, user: CurrentUser) -> Response:
    model = get_model_for_entity(entity)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unsupported export entity")
    rows = [item.model_dump(mode="json") for item in session.exec(select(model)).all()]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=sorted(rows[0].keys()) if rows else ["id"])
    writer.writeheader()
    writer.writerows(rows)
    add_audit_log(session, user, "export_csv", entity, None, new_value={"row_count": len(rows)})
    session.commit()
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{entity}.csv"'})


@router.post("/qr/generate", dependencies=[Depends(require_roles("admin", "engineer"))])
def generate_qr(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict:
    entity_type = str(payload.get("entity_type") or "")
    entity_id = str(payload.get("entity_id") or "")
    if not entity_type or not entity_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="entity_type and entity_id are required")
    qr = QRCode(entity_type=entity_type, entity_id=entity_id, permanent_url=str(payload.get("permanent_url") or f"/{entity_type}/{entity_id}"), qr_image_url=f"/api/qr/stub/{entity_type}/{entity_id}.png", label_text=str(payload.get("label_text") or f"{entity_type} {entity_id}"))
    session.add(qr)
    session.commit()
    session.refresh(qr)
    add_audit_log(session, user, "generate_qr", "qr_codes", qr.id, new_value=qr)
    session.commit()
    return qr.model_dump(mode="json")
