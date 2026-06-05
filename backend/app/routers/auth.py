from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep
from app.auth.security import create_access_token, verify_password
from app.config import settings
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _credentials_from_request(request: Request) -> tuple[str, str]:
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        return str(form.get("username") or form.get("email") or ""), str(form.get("password") or "")
    payload = await request.json()
    return str(payload.get("email") or payload.get("username") or ""), str(payload.get("password") or "")


@router.post("/login")
async def login(request: Request, session: SessionDep) -> dict:
    email, password = await _credentials_from_request(request)
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive account")
    token = create_access_token(subject=user.email, role=user.role, expires_delta=timedelta(minutes=settings.access_token_expire_minutes))
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
    }


@router.get("/me")
def read_me(user: CurrentUser) -> dict:
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role, "is_active": user.is_active}
