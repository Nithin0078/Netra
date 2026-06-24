from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class AuditLogCreate(BaseModel):
    action: str = Field(..., description="Action description, e.g. VIEW_STREAM, REVOKE_CONSENT, UPDATE_PRIVACY_MASK")
    actor_id: str
    actor_username: str
    actor_role: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)

class AuditLogResponse(BaseModel):
    id: str = Field(..., alias="_id")
    action: str
    actor_id: str
    actor_username: str
    actor_role: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Dict[str, Any]
    timestamp: datetime

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "action": "VIEW_STREAM",
                "actor_username": "officersmith",
                "actor_role": "police",
                "resource_id": "camera_123",
                "ip_address": "192.168.1.50",
                "details": {"case_file_id": "CASE-9921"},
                "timestamp": "2026-06-23T12:00:00Z"
            }
        }
