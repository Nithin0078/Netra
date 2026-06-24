import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import connect_to_firebase, close_firebase_connection
from app.routers import citizen, police, stream

# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("netra")

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup operations
    await connect_to_firebase()
    yield
    # Shutdown operations
    await close_firebase_connection()

app = FastAPI(
    title="Netra API",
    description="Privacy-Preserving Community Surveillance Network & AI Trigger Gateway",
    version="1.0.0",
    lifespan=lifespan
)

# Exception handler for rate limits
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure local upload directories exist and are mounted for static access
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(os.path.join(static_dir, "uploads"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Register routes
app.include_router(citizen.router)
app.include_router(police.router)
app.include_router(stream.router)

@app.get("/")
async def root():
    return {
        "app": "Netra API Server",
        "status": "online",
        "version": "1.0.0",
        "mfa_policy": "enforced"
    }
