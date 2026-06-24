from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from typing import List
from datetime import datetime
from google.cloud import firestore

from app.database import get_database, fix_id
from app.models.user import UserRegister, UserLogin, UserResponse, MFASetupResponse, MFAVerifyRequest
from app.models.camera import CameraCreate, CameraUpdate, CameraResponse
from app.auth.security import (
    hash_password, verify_password, create_access_token,
    generate_mfa_secret, get_totp_uri, generate_qr_code_data_uri, verify_totp_code
)
from app.auth.rbac import get_current_user, verify_citizen, verify_any
from app.services.cloudinary_svc import upload_image
from app.services.audit_logger import audit_log_background

router = APIRouter(prefix="/api")

# --- AUTHENTICATION & MFA ENDPOINTS ---

@router.post("/auth/register", response_model=UserResponse)
async def register(user_in: UserRegister):
    db = get_database()
    # Check if username or email already exists
    username_docs = await db.collection("users").where("username", "==", user_in.username).limit(1).get()
    email_docs = await db.collection("users").where("email", "==", user_in.email).limit(1).get()
    
    if username_docs or email_docs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )
    
    doc_ref = db.collection("users").document()
    
    new_user_dict = {
        "username": user_in.username,
        "email": user_in.email,
        "role": user_in.role.value,
        "hashed_password": hash_password(user_in.password),
        "mfa_enabled": False,
        "mfa_secret": None,
        "created_at": datetime.utcnow()
    }
    
    if user_in.role.value == "police":
        new_user_dict["badge_number"] = user_in.badge_number
        new_user_dict["department"] = user_in.department

    new_user_dict["_id"] = doc_ref.id
    await doc_ref.set(new_user_dict)
    
    audit_log_background(
        action="USER_REGISTER",
        actor_id=doc_ref.id,
        actor_username=user_in.username,
        actor_role=user_in.role.value,
        details={"email": user_in.email}
    )
    
    return fix_id(new_user_dict)

@router.post("/auth/login")
async def login(login_in: UserLogin, request: Request):
    db = get_database()
    docs = await db.collection("users").where("username", "==", login_in.username).limit(1).get()
    if not docs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    user = docs[0].to_dict()
    user["_id"] = docs[0].id
    
    if not verify_password(login_in.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    
    # Check if MFA is enabled
    if user.get("mfa_enabled", False):
        if not login_in.totp_code:
            return {
                "mfa_required": True,
                "message": "Multi-factor authentication code required"
            }
        
        # Verify MFA code
        is_valid = verify_totp_code(user["mfa_secret"], login_in.totp_code)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid multi-factor authentication code"
            )
            
    access_token = create_access_token(subject=user["_id"], role=user["role"])
    
    audit_log_background(
        action="USER_LOGIN",
        actor_id=user["_id"],
        actor_username=user["username"],
        actor_role=user["role"],
        ip_address=request.client.host if request.client else None
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["_id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "mfa_enabled": user.get("mfa_enabled", False)
        }
    }

@router.post("/auth/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(current_user: dict = Depends(get_current_user)):
    db = get_database()
    
    # If already set up, we reuse secret or create a new one
    secret = generate_mfa_secret()
    uri = get_totp_uri(secret, current_user["username"])
    qr_code_data_uri = generate_qr_code_data_uri(uri)
    
    # Temporarily store secret on user profile until verified
    await db.collection("users").document(current_user["id"]).update({
        "temp_mfa_secret": secret
    })
    
    return {
        "secret": secret,
        "qr_code_data_uri": qr_code_data_uri,
        "mfa_enabled": current_user["mfa_enabled"]
    }

@router.post("/auth/mfa/verify")
async def verify_mfa(verify_req: MFAVerifyRequest, current_user: dict = Depends(get_current_user)):
    db = get_database()
    doc = await db.collection("users").document(current_user["id"]).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    user_doc = doc.to_dict()
    
    temp_secret = user_doc.get("temp_mfa_secret")
    if not temp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA setup has not been initiated"
        )
        
    is_valid = verify_totp_code(temp_secret, verify_req.token)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please try scanning again."
        )
        
    # Commit MFA activation
    await db.collection("users").document(current_user["id"]).update({
        "mfa_secret": temp_secret,
        "mfa_enabled": True,
        "temp_mfa_secret": firestore.DELETE_FIELD
    })
    
    audit_log_background(
        action="MFA_ENABLED",
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"]
    )
    
    return {"status": "success", "message": "Multi-factor authentication enabled successfully"}


# --- CITIZEN CAMERA MANAGEMENT ENDPOINTS ---

@router.post("/citizen/cameras", response_model=CameraResponse)
async def add_camera(camera_in: CameraCreate, current_user: dict = Depends(verify_citizen)):
    db = get_database()
    doc_ref = db.collection("cameras").document()
    
    camera_dict = {
        "name": camera_in.name,
        "stream_url": camera_in.stream_url,
        "location": camera_in.location.model_dump(),
        "consent_shared": camera_in.consent_shared,
        "owner_id": current_user["id"],
        "privacy_zones": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    camera_dict["_id"] = doc_ref.id
    await doc_ref.set(camera_dict)
    
    audit_log_background(
        action="REGISTER_CAMERA",
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"],
        resource_id=doc_ref.id,
        details={"name": camera_in.name, "consent_shared": camera_in.consent_shared}
    )
    
    return fix_id(camera_dict)

@router.get("/citizen/cameras", response_model=List[CameraResponse])
async def list_cameras(current_user: dict = Depends(verify_citizen)):
    db = get_database()
    query = db.collection("cameras").where("owner_id", "==", current_user["id"])
    cameras = []
    async for doc in query.stream():
        cameras.append(fix_id(doc))
    return cameras

@router.put("/citizen/cameras/{camera_id}", response_model=CameraResponse)
async def update_camera(camera_id: str, update_in: CameraUpdate, current_user: dict = Depends(verify_citizen)):
    db = get_database()
    
    # Check ownership
    doc_ref = db.collection("cameras").document(camera_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found or you are not the owner"
        )
        
    update_data = {}
    if update_in.name is not None:
        update_data["name"] = update_in.name
    if update_in.stream_url is not None:
        update_data["stream_url"] = update_in.stream_url
    if update_in.location is not None:
        update_data["location"] = update_in.location.model_dump()
    if update_in.consent_shared is not None:
        update_data["consent_shared"] = update_in.consent_shared
    if update_in.privacy_zones is not None:
        update_data["privacy_zones"] = [zone.model_dump() for zone in update_in.privacy_zones]
        
    update_data["updated_at"] = datetime.utcnow()
    
    await doc_ref.update(update_data)
    
    updated_doc = await doc_ref.get()
    
    audit_log_background(
        action="UPDATE_CAMERA",
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"],
        resource_id=camera_id,
        details={"updated_fields": list(update_data.keys())}
    )
    
    return fix_id(updated_doc)

@router.delete("/citizen/cameras/{camera_id}")
async def delete_camera(camera_id: str, current_user: dict = Depends(verify_citizen)):
    db = get_database()
    
    doc_ref = db.collection("cameras").document(camera_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found or you are not the owner"
        )
        
    await doc_ref.delete()
    
    audit_log_background(
        action="DELETE_CAMERA",
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"],
        resource_id=camera_id,
        details={"name": doc.to_dict().get("name")}
    )
    
    return {"status": "success", "message": "Camera deleted successfully"}

@router.post("/citizen/cameras/{camera_id}/consent")
async def toggle_consent(camera_id: str, consent: bool, current_user: dict = Depends(verify_citizen)):
    db = get_database()
    
    doc_ref = db.collection("cameras").document(camera_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found or you are not the owner"
        )
        
    await doc_ref.update({
        "consent_shared": consent,
        "updated_at": datetime.utcnow()
    })
    
    action = "GRANT_CONSENT" if consent else "REVOKE_CONSENT"
    audit_log_background(
        action=action,
        actor_id=current_user["id"],
        actor_username=current_user["username"],
        actor_role=current_user["role"],
        resource_id=camera_id,
        details={"camera_name": doc.to_dict().get("name")}
    )
    
    return {"status": "success", "consent_shared": consent}

@router.post("/citizen/cameras/upload-snapshot")
async def upload_camera_snapshot(file: UploadFile = File(...), current_user: dict = Depends(verify_citizen)):
    # Upload file through the upload manager
    url = await upload_image(file, folder="netra_cameras")
    return {"url": url}

@router.get("/citizen/audit-logs")
async def list_citizen_audit_logs(current_user: dict = Depends(verify_citizen)):
    """
    Retrieves audit logs related to cameras owned by the current citizen.
    This guarantees full visibility of who, when, and why someone accessed their feeds.
    """
    db = get_database()
    
    # 1. Fetch all cameras owned by this citizen
    cameras_query = db.collection("cameras").where("owner_id", "==", current_user["id"])
    camera_ids = []
    async for doc in cameras_query.stream():
        camera_ids.append(doc.id)
        
    if not camera_ids:
        return []
        
    # 2. Fetch logs targeting those camera IDs in chunks of 30 due to Firestore 'in' query limitations
    logs = []
    for i in range(0, len(camera_ids), 30):
        chunk = camera_ids[i:i+30]
        query = db.collection("audit_logs").where("resource_id", "in", chunk)
        async for log_doc in query.stream():
            logs.append(fix_id(log_doc))
            
    # Sort in memory by timestamp descending
    logs.sort(key=lambda x: x.get("timestamp"), reverse=True)
    return logs

