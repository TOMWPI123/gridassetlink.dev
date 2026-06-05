from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: TokenUser
