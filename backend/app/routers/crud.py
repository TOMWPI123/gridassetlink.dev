from typing import Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import String, cast, or_
from sqlmodel import SQLModel, select

from app.auth.dependencies import CurrentUser, SessionDep, require_roles
from app.auth.security import hash_password
from app.models import (
    Attachment,
    AssumedOPGWRoute,
    AuditLog,
    Circuit,
    CircuitPath,
    CircuitPathElement,
    CommissioningChecklist,
    CommissioningChecklistItem,
    Device,
    DevicePort,
    DistributionFeeder,
    FiberAssignment,
    FiberCable,
    FiberSegment,
    FiberSplice,
    FiberStrand,
    IconEngineeringProfile,
    IconModule,
    IconNode,
    IconProposedService,
    IconServiceTemplate,
    IconSlot,
    LeasedService,
    MaintenanceRecord,
    OperationalCircuitState,
    OperationalDeviceState,
    OperationalPortState,
    OperationalSnapshot,
    PatchPanel,
    PatchPanelPort,
    ProtectionService,
    ProposedChange,
    ProposedChangeDiff,
    Provider,
    PublicDataImportBatch,
    PublicDataSource,
    QRCode,
    Rack,
    RegionalAccessAgreement,
    RegionalAssetPermission,
    RegionalIconRing,
    RegionalStructure,
    RegionalSubstation,
    RegionalSyntheticCircuit,
    RegionalTelecomOverlay,
    RegionalTransmissionLine,
    RegionalUtilityOwner,
    RegionalVoltageClass,
    SQLReport,
    SpliceClosure,
    SpliceTray,
    Substation,
    TimingSource,
    TransmissionLine,
    User,
    WorkOrder,
    WorkOrderAttachment,
    WorkOrderMaterial,
    WorkOrderTask,
    WorkOrderUpdate,
)
from app.services.audit import add_audit_log, model_to_dict

ModelT = TypeVar("ModelT", bound=SQLModel)

MODEL_REGISTRY: dict[str, type[SQLModel]] = {
    "attachments": Attachment,
    "assumed-opgw-routes": AssumedOPGWRoute,
    "audit-logs": AuditLog,
    "circuits": Circuit,
    "circuit-paths": CircuitPath,
    "circuit-path-elements": CircuitPathElement,
    "commissioning-checklists": CommissioningChecklist,
    "commissioning-checklist-items": CommissioningChecklistItem,
    "devices": Device,
    "device-ports": DevicePort,
    "distribution-feeders": DistributionFeeder,
    "fiber-assignments": FiberAssignment,
    "fiber-cables": FiberCable,
    "fiber-segments": FiberSegment,
    "fiber-splices": FiberSplice,
    "fiber-strands": FiberStrand,
    "icon-engineering-profiles": IconEngineeringProfile,
    "icon-modules": IconModule,
    "icon-nodes": IconNode,
    "icon-proposed-services": IconProposedService,
    "icon-service-templates": IconServiceTemplate,
    "icon-slots": IconSlot,
    "leased-services": LeasedService,
    "maintenance-records": MaintenanceRecord,
    "operational-circuit-states": OperationalCircuitState,
    "operational-device-states": OperationalDeviceState,
    "operational-port-states": OperationalPortState,
    "operational-snapshots": OperationalSnapshot,
    "patch-panels": PatchPanel,
    "patch-panel-ports": PatchPanelPort,
    "protection-services": ProtectionService,
    "proposed-changes": ProposedChange,
    "proposed-change-diffs": ProposedChangeDiff,
    "providers": Provider,
    "public-data-import-batches": PublicDataImportBatch,
    "public-data-sources": PublicDataSource,
    "qr-codes": QRCode,
    "racks": Rack,
    "regional-access-agreements": RegionalAccessAgreement,
    "regional-asset-permissions": RegionalAssetPermission,
    "regional-icon-rings": RegionalIconRing,
    "regional-structures": RegionalStructure,
    "regional-substations": RegionalSubstation,
    "regional-synthetic-circuits": RegionalSyntheticCircuit,
    "regional-telecom-overlays": RegionalTelecomOverlay,
    "regional-transmission-lines": RegionalTransmissionLine,
    "regional-utility-owners": RegionalUtilityOwner,
    "regional-voltage-classes": RegionalVoltageClass,
    "sql-reports": SQLReport,
    "splice-closures": SpliceClosure,
    "splice-trays": SpliceTray,
    "substations": Substation,
    "timing-sources": TimingSource,
    "transmission-lines": TransmissionLine,
    "users": User,
    "work-orders": WorkOrder,
    "work-order-attachments": WorkOrderAttachment,
    "work-order-materials": WorkOrderMaterial,
    "work-order-tasks": WorkOrderTask,
    "work-order-updates": WorkOrderUpdate,
}


def _public_dump(obj: SQLModel) -> dict[str, Any]:
    data = model_to_dict(obj)
    data.pop("password_hash", None)
    return data


def _validate_payload(model: type[ModelT], payload: dict[str, Any]) -> ModelT:
    payload.pop("id", None)
    if model is User:
        password = payload.pop("password", None)
        if password:
            payload["password_hash"] = hash_password(str(password))
        elif "password_hash" in payload and not str(payload["password_hash"]).startswith("pbkdf2_sha256$"):
            payload["password_hash"] = hash_password(str(payload["password_hash"]))
    if hasattr(model, "model_validate"):
        return model.model_validate(payload)  # type: ignore[attr-defined]
    return model(**payload)


def _patch_model(obj: SQLModel, payload: dict[str, Any]) -> None:
    payload.pop("id", None)
    if isinstance(obj, User):
        password = payload.pop("password", None)
        if password:
            payload["password_hash"] = hash_password(str(password))
        elif "password_hash" in payload and not str(payload["password_hash"]).startswith("pbkdf2_sha256$"):
            payload["password_hash"] = hash_password(str(payload["password_hash"]))
    for key, value in payload.items():
        if hasattr(obj, key):
            setattr(obj, key, value)


def _search_statement(model: type[ModelT], search: str | None):
    statement = select(model)
    if search:
        fields = []
        for name, field in model.model_fields.items():  # type: ignore[attr-defined]
            annotation = str(field.annotation)
            if "str" in annotation or name.endswith("_id") or name == "id":
                fields.append(cast(getattr(model, name), String).ilike(f"%{search}%"))
        if fields:
            statement = statement.where(or_(*fields))
    return statement


def build_crud_router(slug: str, model: type[ModelT], tag: str) -> APIRouter:
    router = APIRouter(prefix=f"/api/{slug}", tags=[tag])

    @router.get("")
    @router.get("/")
    def list_items(session: SessionDep, _: CurrentUser, search: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        limit = min(max(limit, 1), 500)
        return [_public_dump(item) for item in session.exec(_search_statement(model, search).offset(offset).limit(limit)).all()]

    @router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
    @router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
    def create_item(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
        obj = _validate_payload(model, payload)
        if hasattr(obj, "created_by"):
            setattr(obj, "created_by", user.id)
        if hasattr(obj, "updated_by"):
            setattr(obj, "updated_by", user.id)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        add_audit_log(session, user, "create", slug, getattr(obj, "id", None), new_value=obj)
        session.commit()
        return _public_dump(obj)

    @router.get("/{item_id}")
    def get_item(item_id: int, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
        obj = session.get(model, item_id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        return _public_dump(obj)

    @router.put("/{item_id}", dependencies=[Depends(require_roles("admin", "engineer"))])
    def update_item(item_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
        obj = session.get(model, item_id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        old_value = _public_dump(obj)
        _patch_model(obj, payload)
        if hasattr(obj, "updated_by"):
            setattr(obj, "updated_by", user.id)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        add_audit_log(session, user, "update", slug, item_id, old_value=old_value, new_value=obj)
        session.commit()
        return _public_dump(obj)

    @router.delete("/{item_id}", dependencies=[Depends(require_roles("admin"))])
    def delete_item(item_id: int, session: SessionDep, user: CurrentUser) -> dict[str, str]:
        obj = session.get(model, item_id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        old_value = _public_dump(obj)
        session.delete(obj)
        add_audit_log(session, user, "delete", slug, item_id, old_value=old_value)
        session.commit()
        return {"status": "deleted"}

    return router


def all_crud_routers() -> list[APIRouter]:
    return [build_crud_router(slug, model, slug.replace("-", " ").title()) for slug, model in MODEL_REGISTRY.items()]


def get_model_for_entity(entity: str) -> type[SQLModel] | None:
    return MODEL_REGISTRY.get(entity)
