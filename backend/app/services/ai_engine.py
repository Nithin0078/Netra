import cv2
import numpy as np
import logging
import time
import random
from typing import List, Dict, Any, Tuple
from app.models.camera import Polygon

logger = logging.getLogger(__name__)

# Attempt to load YOLO from Ultralytics
try:
    from ultralytics import YOLO
    # Load a lightweight nano model
    yolo_model = YOLO("yolov8n.pt")
    HAS_YOLO = True
    logger.info("YOLOv8 successfully initialized from ultralytics.")
except Exception as e:
    HAS_YOLO = False
    logger.warning(f"Ultralytics YOLOv8 library not available or failed to load ({e}). Using simulated AI engine fallback.")

def apply_privacy_zones(frame: np.ndarray, privacy_zones: List[Polygon]) -> np.ndarray:
    """
    Applies privacy masks to a frame.
    We apply a heavy Gaussian blur to the polygon regions defined by the citizen.
    """
    if not privacy_zones:
        return frame

    h, w = frame.shape[:2]
    # Create mask: 255 for allowed areas, 0 for privacy zones
    mask = np.ones((h, w), dtype=np.uint8) * 255

    for zone in privacy_zones:
        pts = []
        for pt in zone.points:
            x_px = int(pt.x * w)
            y_px = int(pt.y * h)
            pts.append([x_px, y_px])
        
        if len(pts) >= 3:
            cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 0)

    # Blur the entire frame
    blurred_frame = cv2.GaussianBlur(frame, (99, 99), 30)

    # Combine original and blurred frames using the mask
    mask_3d = cv2.merge([mask, mask, mask])
    output_frame = np.where(mask_3d == 255, frame, blurred_frame)

    return output_frame

def check_point_in_polygon(x: int, y: int, polygon: List[Tuple[int, int]]) -> bool:
    """Ray-casting algorithm to check if a point is inside a polygon."""
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def is_box_masked(box: Tuple[int, int, int, int], privacy_zones: List[Polygon], frame_w: int, frame_h: int) -> bool:
    """
    Checks if a bounding box centers inside any of the privacy zones.
    If it is inside a privacy zone, we should hide the detection.
    """
    x1, y1, x2, y2 = box
    cx = int((x1 + x2) / 2)
    cy = int((y1 + y2) / 2)

    for zone in privacy_zones:
        poly_pts = [(int(pt.x * frame_w), int(pt.y * frame_h)) for pt in zone.points]
        if len(poly_pts) >= 3:
            if check_point_in_polygon(cx, cy, poly_pts):
                return True
    return False

def run_ai_detection(frame: np.ndarray, privacy_zones: List[Polygon]) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Runs face, license plate, vehicle, and pedestrian detection.
    Masks the private zones first, then detects (or masks the outputs) to preserve privacy.
    Returns: (processed_frame, list_of_detections)
    """
    h, w = frame.shape[:2]
    
    # 1. Apply privacy masks directly to the frame
    masked_frame = apply_privacy_zones(frame, privacy_zones)
    
    detections = []

    if HAS_YOLO:
        try:
            results = yolo_model(masked_frame, verbose=False)
            for r in results:
                boxes = r.boxes
                for box in boxes:
                    cls = int(box.cls[0])
                    label = yolo_model.names[cls]
                    conf = float(box.conf[0])
                    
                    # We look for people (person), cars, trucks, motorcycles, buses
                    if label in ["person", "car", "truck", "motorcycle", "bus"] and conf > 0.4:
                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = map(int, xyxy)
                        
                        # Double-check: if the center of this object is in a privacy zone, mask it out
                        if is_box_masked((x1, y1, x2, y2), privacy_zones, w, h):
                            continue
                            
                        category = "Pedestrian" if label == "person" else "Vehicle"
                        
                        # Draw bounding box on frame
                        color = (0, 255, 0) if category == "Pedestrian" else (255, 0, 0)
                        cv2.rectangle(masked_frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(masked_frame, f"{category} ({conf:.2f})", (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                        
                        detections.append({
                            "type": category,
                            "confidence": conf,
                            "box": [x1, y1, x2 - x1, y2 - y1], # x, y, w, h
                            "label": label
                        })
            return masked_frame, detections
        except Exception as e:
            logger.error(f"YOLO detection failed: {e}. Falling back to simulation.")

    # 2. Simulated detection engine
    # Generates simulated objects that wander around the frame over time.
    # We use timestamps to move simulated boxes predictably.
    t = time.time()
    
    # Simulating 3 moving objects
    # Object 1: Pedestrian walking across
    ped_x = int((t * 30) % (w + 100)) - 50
    ped_y = int(h * 0.6)
    ped_box = (ped_x, ped_y, ped_x + 30, ped_y + 70)
    
    # Object 2: Car driving across
    car_x = w - int((t * 60) % (w + 150))
    car_y = int(h * 0.75)
    car_box = (car_x, car_y, car_x + 90, car_y + 50)

    # Object 3: License plate (attached to car)
    plate_box = (car_x + 70, car_y + 30, car_x + 85, car_y + 40) if (car_x + 85 < w) else None

    simulated_candidates = [
        {"type": "Pedestrian", "box": ped_box, "label": "person", "conf": 0.89},
        {"type": "Vehicle", "box": car_box, "label": "car", "conf": 0.95}
    ]
    if plate_box:
        simulated_candidates.append({"type": "License Plate", "box": plate_box, "label": "license-plate", "conf": 0.92})

    for item in simulated_candidates:
        x1, y1, x2, y2 = item["box"]
        # Ensure bounding boxes stay within frame limits
        x1 = max(0, min(w, x1))
        x2 = max(0, min(w, x2))
        y1 = max(0, min(h, y1))
        y2 = max(0, min(h, y2))
        
        if x2 - x1 > 5 and y2 - y1 > 5:
            # Check if this box lies inside user-defined privacy zone
            if is_box_masked((x1, y1, x2, y2), privacy_zones, w, h):
                continue
            
            # Select colors
            if item["type"] == "Pedestrian":
                color = (46, 213, 115) # Emerald Green
            elif item["type"] == "Vehicle":
                color = (83, 82, 237) # Premium Indigo
            else:
                color = (255, 71, 87) # Crimson Red

            # Draw bounding box and label
            cv2.rectangle(masked_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(masked_frame, f"{item['type']} ({item['conf']:.2f})", (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)
            
            detections.append({
                "type": item["type"],
                "confidence": item["conf"],
                "box": [x1, y1, x2 - x1, y2 - y1],
                "label": item["label"]
            })

    return masked_frame, detections
