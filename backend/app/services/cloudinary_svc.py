import os
import uuid
import logging
from fastapi import UploadFile

logger = logging.getLogger(__name__)

# Try to initialize Cloudinary
CLOUDINARY_CLOUD_NAME = os.getenv("drg4moq8m")
CLOUDINARY_API_KEY = os.getenv("693934194763132")
CLOUDINARY_API_SECRET = os.getenv("ezvea1a6KAZzVhmO89Ajj_ZiGsk")

is_cloudinary_configured = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)

if is_cloudinary_configured:
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )
    logger.info("Cloudinary service configured successfully.")
else:
    logger.warning("Cloudinary configuration missing. Falling back to local storage directory.")
    # Ensure local upload dir exists
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "uploads")
    os.makedirs(UPLOAD_DIR, exist_ok=True)

async def upload_image(file: UploadFile, folder: str = "netra") -> str:
    """
    Uploads an image to Cloudinary (if configured) or saves it locally (fallback).
    Returns the public URL of the uploaded image.
    """
    if is_cloudinary_configured:
        try:
            # Read contents
            contents = await file.read()
            upload_result = cloudinary.uploader.upload(
                contents,
                folder=folder,
                resource_type="image"
            )
            return upload_result.get("secure_url")
        except Exception as e:
            logger.error(f"Cloudinary upload failed, falling back to local: {e}")
            # Fall through to local fallback
    
    # Local storage fallback
    try:
        # Seek file to start in case it was read
        await file.seek(0)
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            contents = await file.read()
            buffer.write(contents)
        
        # Return local path serving URL. In main.py we will mount static files under /static
        # We assume local server runs on port 8000 (standard FastAPI)
        # In a real environment, we'd use relative URLs or host configurations.
        return f"/static/uploads/{unique_filename}"
    except Exception as e:
        logger.error(f"Local file storage upload failed: {e}")
        raise RuntimeError("Media storage upload failed") from e
