from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_db_and_tables
from app.routers import auth, dashboard, deviceops, regional_grid, sql, workflows
from app.routers.crud import all_crud_routers

app = FastAPI(title=settings.app_name, description="Fictional utility telecom planning and asset management API.", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(workflows.router)
app.include_router(deviceops.router)
app.include_router(regional_grid.router)
app.include_router(sql.router)
for router in all_crud_routers():
    app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    if settings.auto_seed:
        from app.seed.seed import seed_database

        seed_database()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
