from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Point(BaseModel):
    x: float = Field(..., description="Normalized X coordinate between 0.0 and 1.0")
    y: float = Field(..., description="Normalized Y coordinate between 0.0 and 1.0")

class Polygon(BaseModel):
    points: List[Point] = Field(..., description="List of vertices defining the privacy zone polygon")

class CameraLocation(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None

class CameraBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    stream_url: str = Field(..., description="RTSP, IP stream, or placeholder video feed path")
    location: CameraLocation
    consent_shared: bool = Field(default=False, description="Citizen consent: True if shared with Police")

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    location: Optional[CameraLocation] = None
    consent_shared: Optional[bool] = None
    privacy_zones: Optional[List[Polygon]] = None

class CameraResponse(CameraBase):
    id: str = Field(..., alias="_id")
    owner_id: str
    privacy_zones: List[Polygon] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
