"""FastAPI application for the CodeTranslator Agent service."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.session_routes import router as session_router
from app.routes.ws_routes import router as ws_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Create the FastAPI application
app = FastAPI(
    title="CodeTranslator Agent",
    description="Intelligent code translation service that converts projects between programming languages",
    version="1.0.0",
)

# Add CORS middleware (allow all origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(session_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "CodeTranslator Agent",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    logger.info("CodeTranslator Agent service starting up on port 3003")
    # Ensure upload directory exists
    import os
    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "upload")
    os.makedirs(upload_dir, exist_ok=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    logger.info("CodeTranslator Agent service shutting down")
