from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from app.database import get_database, fix_id
from app.auth.rbac import verify_police
from app.services.audit_logger import audit_log_background

router = APIRouter(prefix="/api/police")

@router.get("/cameras")
async def get_shared_cameras(current_user: dict = Depends(verify_police)):
    """
    Lists all cameras currently shared by citizens (consent_shared == True).
    We hide the exact stream URLs in bulk listings to avoid leaks, only revealing them
    when a police officer requests direct streaming of a single camera with an audit log.
    """
    db = get_database()
    query = db.collection("cameras").where("consent_shared", "==", True)
    cameras = []
    async for doc in query.stream():
        camera = fix_id(doc)
        # Strip raw stream url in list view for enhanced security
        camera.pop("stream_url", None)
        cameras.append(camera)
    return cameras

@router.get("/cameras/{camera_id}")
async def get_camera_detail(camera_id: str, current_user: dict = Depends(verify_police)):
    """
    Gets detailed information of a shared camera, including checking that consent is active.
    """
    db = get_database()
    doc = await db.collection("cameras").document(camera_id).get()
    if not doc.exists or not doc.to_dict().get("consent_shared", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared camera not found or consent has been revoked"
        )
    return fix_id(doc)

@router.post("/cases")
async def register_investigation_case(
    case_number: str = Query(..., description="E.g., CASE-2026-9912"),
    camera_id: str = Query(..., description="The camera being investigated"),
    reason: str = Query(..., description="Justification for accessing the camera feed"),
    current_user: dict = Depends(verify_police)
):
    """
    Logs an official case folder reference prior to accessing streams.
    This creates a binding log entry that links this officer to the camera stream.
    """
    db = get_database()
    
    # Verify camera exists and consent is shared
    doc = await db.collection("cameras").document(camera_id).get()
    if not doc.exists or not doc.to_dict().get("consent_shared", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera is not shared or does not exist"
        )
    camera = fix_id(doc)
    
    audit_log_background(
        action="POLICE_CASE_ACCESS",
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"],
        resource_id=camera_id,
        details={
            "case_number": case_number,
            "reason": reason,
            "camera_name": camera.get("name")
        }
    )
    
    return {
        "status": "success",
        "case_number": case_number,
        "authorized": True,
        "camera": fix_id(camera)
    }

@router.get("/audit-logs")
async def get_audit_logs(
    username: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(verify_police)
):
    """
    Returns audit trails of police access for accountability checks.
    """
    db = get_database()
    query = db.collection("audit_logs")
    
    if username:
        query = query.where("actor_username", "==", username)
    if action:
        query = query.where("action", "==", action)
        
    logs = []
    async for doc in query.stream():
        logs.append(fix_id(doc))
        
    # Sort in memory by timestamp descending to avoid composite index requirements in Firestore
    logs.sort(key=lambda x: x.get("timestamp"), reverse=True)
    return logs[:limit]
