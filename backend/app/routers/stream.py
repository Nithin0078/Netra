import time
import cv2
import numpy as np
import logging
import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from bson import ObjectId

from app.database import get_database
from app.models.camera import Polygon
from app.auth.security import decode_access_token
from app.services.ai_engine import run_ai_detection, apply_privacy_zones

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

def generate_mock_scene_frame() -> np.ndarray:
    """
    Generates a dynamic 640x480 pixel frame representing a suburban street.
    This simulates CCTV footage to test privacy zones and object detections.
    """
    w, h = 640, 480
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    
    # 1. Sky (Top 50%)
    cv2.rectangle(frame, (0, 0), (w, int(h * 0.5)), (198, 168, 135), -1) # Sky color
    
    # 2. Road & Sidewalk (Bottom 50%)
    cv2.rectangle(frame, (0, int(h * 0.5)), (w, h), (34, 139, 34), -1) # Grass background
    cv2.rectangle(frame, (0, int(h * 0.6)), (w, h), (80, 80, 80), -1) # Asphalt road
    cv2.rectangle(frame, (0, int(h * 0.55)), (w, int(h * 0.6)), (180, 180, 180), -1) # Sidewalk
    
    # Road dashed lines
    for x in range(0, w, 80):
        cv2.rectangle(frame, (x, int(h * 0.78)), (x + 40, int(h * 0.80)), (255, 255, 255), -1)
        
    # 3. Simple Houses in Background
    cv2.rectangle(frame, (80, int(h * 0.35)), (180, int(h * 0.55)), (150, 75, 0), -1) # House 1
    cv2.fillPoly(frame, [np.array([[70, int(h * 0.35)], [130, int(h * 0.25)], [190, int(h * 0.35)]])], (0, 0, 150)) # Roof 1
    
    cv2.rectangle(frame, (400, int(h * 0.38)), (540, int(h * 0.55)), (100, 100, 250), -1) # House 2
    cv2.fillPoly(frame, [np.array([[390, int(h * 0.38)], [470, int(h * 0.28)], [550, int(h * 0.38)]])], (150, 150, 150)) # Roof 2
    
    # 4. Burn-in timestamp
    timestamp_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    cv2.putText(frame, f"CCTV 01 - UTC: {timestamp_str}", (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
                
    return frame

async def mjpeg_frame_generator(camera_id: str, run_yolo: bool, user_id: str, user_role: str):
    db = get_database()
    
    last_consent_check = 0.0
    privacy_zones = []
    
    try:
        while True:
            now = time.time()
            # Query Database every 2 seconds to reduce DB overhead
            if now - last_consent_check > 2.0:
                last_consent_check = now
                doc = await db.collection("cameras").document(camera_id).get()
                if not doc.exists:
                    camera = None
                else:
                    camera = doc.to_dict()
                if not camera:
                    logger.warning(f"CCTV Stream {camera_id}: Camera deleted.")
                    break
                
                # STRICT CONSENT GUARDRAIL
                # If viewer is police, verify citizen consent is still granted
                if user_role == "police":
                    consent_shared = camera.get("consent_shared", False)
                    if not consent_shared:
                        # INSTANT REVOCATION ACTION
                        logger.warning(f"CCTV Stream {camera_id}: Police stream cut due to consent revocation.")
                        # Yield a warning frame indicating consent revoked
                        warning_card = np.zeros((480, 640, 3), dtype=np.uint8)
                        cv2.rectangle(warning_card, (20, 20), (620, 460), (0, 0, 150), -1)
                        cv2.putText(warning_card, "SECURITY PROTOCOL TRIPPED", (80, 200),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2, cv2.LINE_AA)
                        cv2.putText(warning_card, "ACCESS REVOKED BY CAMERA OWNER", (60, 250),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1, cv2.LINE_AA)
                        
                        _, jpeg = cv2.imencode('.jpg', warning_card)
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                        break
                
                # Fetch updated privacy zones (updates dynamically if user alters them on frontend canvas)
                privacy_zones = []
                for zone_data in camera.get("privacy_zones", []):
                    try:
                        privacy_zones.append(Polygon(**zone_data))
                    except Exception as pe:
                        logger.error(f"Error parsing privacy zone polygon: {pe}")

            # Generate dynamic mock scene frame
            frame = generate_mock_scene_frame()
            
            # Apply privacy zones + object detection overlays
            if run_yolo:
                processed_frame, _ = run_ai_detection(frame, privacy_zones)
            else:
                processed_frame = apply_privacy_zones(frame, privacy_zones)
                
            # Compress frame to JPEG
            ret, jpeg_buf = cv2.imencode('.jpg', processed_frame)
            if not ret:
                await asyncio.sleep(0.05)
                continue
                
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg_buf.tobytes() + b'\r\n')
            
            # Target ~15-20 frames per second
            await asyncio.sleep(0.06)
            
    except asyncio.CancelledError:
        logger.info(f"CCTV Stream {camera_id}: Stream disconnected by viewer.")
    except Exception as e:
        logger.error(f"CCTV Stream {camera_id}: Stream generator crashed: {e}")

@router.get("/stream/{camera_id}")
async def stream_camera(
    camera_id: str,
    token: str = Query(..., description="Access token passed via URL query for tag compatibility"),
    yolo: bool = Query(False, description="Enable YOLOv8 AI object annotations overlay")
):
    """
    Streams live camera feed with real-time privacy zoning and consent-revocation checks.
    Since HTML <img> elements cannot send Authorization Headers, token is verified via query.
    """
    # 1. Decode token
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token invalid or expired"
        )
    
    user_id = payload.get("sub")
    user_role = payload.get("role")
    
    # 2. Check camera existence & permissions in DB
    db = get_database()
    doc = await db.collection("cameras").document(camera_id).get()
    if not doc.exists:
        camera = None
    else:
        camera = doc.to_dict()
        camera["_id"] = doc.id
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera does not exist"
        )
        
    # Check permissions:
    # - Citizen must own the camera to stream it
    # - Police can only stream if consent is shared
    if user_role == "citizen":
        if camera["owner_id"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to stream this camera"
            )
    elif user_role == "police":
        if not camera.get("consent_shared", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Camera consent has been revoked by citizen"
            )
            
    return StreamingResponse(
        mjpeg_frame_generator(camera_id, yolo, user_id, user_role),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
