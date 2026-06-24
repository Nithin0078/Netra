import logging
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from app.database import get_database

logger = logging.getLogger(__name__)

async def write_audit_log(
    action: str,
    actor_id: str,
    actor_username: str,
    actor_role: str,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Writes an audit log entry to MongoDB in a fire-and-forget or awaited non-blocking fashion.
    """
    db = get_database()
    if db is None:
        logger.error("Audit log failed: Database not connected.")
        return

    log_entry = {
        "action": action,
        "actor_id": actor_id,
        "actor_username": actor_username,
        "actor_role": actor_role,
        "resource_id": resource_id,
        "ip_address": ip_address,
        "details": details or {},
        "timestamp": datetime.utcnow()
    }
    
    try:
        doc_ref = db.collection("audit_logs").document()
        await doc_ref.set(log_entry)
    except Exception as e:
        logger.error(f"Failed to write audit log to database: {e}")

def audit_log_background(
    action: str,
    actor_id: str,
    actor_username: str,
    actor_role: str,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Convenience method to schedule audit logging in the background without blocking request responses.
    """
    asyncio.create_task(
        write_audit_log(action, actor_id, actor_username, actor_role, resource_id, ip_address, details)
    )
