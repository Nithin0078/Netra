import os
import logging
from google.cloud.firestore import AsyncClient
from google.oauth2 import service_account
from dotenv import load_dotenv

# Load local environment variables from .env
load_dotenv()

logger = logging.getLogger(__name__)

# Fallback values for local development if not provided in environment
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "netra-firebase-project")
FIREBASE_SERVICE_ACCOUNT_KEY_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")
FIRESTORE_EMULATOR_HOST = os.getenv("FIRESTORE_EMULATOR_HOST")

# If emulator host is specified, set the environment variable
if FIRESTORE_EMULATOR_HOST:
    os.environ["FIRESTORE_EMULATOR_HOST"] = FIRESTORE_EMULATOR_HOST

db = None

async def connect_to_firebase():
    global db
    logger.info("Initializing Firestore client...")
    try:
        firebase_creds = os.getenv("FIREBASE_CREDENTIALS")
        if FIRESTORE_EMULATOR_HOST:
            logger.info(f"Connecting to Firestore Emulator at {FIRESTORE_EMULATOR_HOST}...")
            # For emulator, load with dummy credentials to prevent Google Auth credentials checks
            from google.auth.credentials import AnonymousCredentials
            db = AsyncClient(
                project=FIREBASE_PROJECT_ID,
                credentials=AnonymousCredentials()
            )
        elif firebase_creds:
            import json
            logger.info("Connecting to Firestore using FIREBASE_CREDENTIALS environment variable JSON...")
            creds_dict = json.loads(firebase_creds)
            creds = service_account.Credentials.from_service_account_info(creds_dict)
            db = AsyncClient(
                project=creds_dict.get("project_id", FIREBASE_PROJECT_ID),
                credentials=creds
            )
        elif FIREBASE_SERVICE_ACCOUNT_KEY_PATH and os.path.exists(FIREBASE_SERVICE_ACCOUNT_KEY_PATH):
            logger.info(f"Connecting to Firestore using service account file: {FIREBASE_SERVICE_ACCOUNT_KEY_PATH}")
            db = AsyncClient.from_service_account_json(FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
        else:
            logger.info("Connecting to Firestore using Application Default Credentials.")
            db = AsyncClient()
        
        logger.info("Successfully connected to Firestore.")
    except Exception as e:
        logger.error(f"Failed to connect to Firestore: {e}")
        raise e

async def close_firebase_connection():
    global db
    if db:
        await db.close()
        logger.info("Firestore connection closed.")

def get_database():
    return db

def fix_id(doc):
    """
    If doc is a Firestore DocumentSnapshot, convert it to a dict with _id.
    If it is already a dict, ensure it has _id or return it.
    """
    if doc is None:
        return None
    if hasattr(doc, "to_dict"):
        if not getattr(doc, "exists", True):
            return None
        data = doc.to_dict()
        if data is not None:
            data["_id"] = doc.id
        return data
    return doc
