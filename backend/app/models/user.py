from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    CITIZEN = "citizen"
    POLICE = "police"
    ADMIN = "admin"

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    role: UserRole

class UserRegister(UserBase):
    password: str = Field(..., min_length=6)
    # Police specific fields (optional, only checked if role == POLICE)
    badge_number: Optional[str] = None
    department: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str
    totp_code: Optional[str] = None

class UserResponse(UserBase):
    id: str = Field(..., alias="_id")
    mfa_enabled: bool
    created_at: datetime
    badge_number: Optional[str] = None
    department: Optional[str] = None

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "username": "johndoe",
                "email": "john@example.com",
                "role": "citizen",
                "mfa_enabled": False,
                "created_at": "2026-06-23T12:00:00Z"
            }
        }

class MFASetupResponse(BaseModel):
    secret: str
    qr_code_data_uri: str
    mfa_enabled: bool

class MFAVerifyRequest(BaseModel):
    token: str
