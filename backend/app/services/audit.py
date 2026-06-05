from datetime import date, datetime
from typing import Any

from sqlmodel import Session

from app.models import AuditLog, User


def model_to_dict(obj: Any) -> dict[str, Any]:
    if hasattr(obj, "model_dump"):
        data = obj.model_dump(mode="json")
        if data:
            return data
    if hasattr(obj, "__table__"):
        return {column.name: json_value(getattr(obj, column.name)) for column in obj.__table__.columns}
    if hasattr(obj, "dict"):
        return obj.dict()
    return dict(obj)


def json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def add_audit_log(
    session: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: str | int | None,
    old_value: Any = None,
    new_value: Any = None,
) -> None:
    session.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            old_value_json=model_to_dict(old_value) if old_value is not None else None,
            new_value_json=model_to_dict(new_value) if new_value is not None else None,
        )
    )
