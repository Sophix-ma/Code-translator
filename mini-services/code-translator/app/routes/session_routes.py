"""REST API routes for session management."""

import logging
import os
import shutil
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.models import CreateSessionRequest, FileEntry, Session
from app.services.analysis_service import EXTENSION_MAP

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# In-memory session store (shared with ws_routes via main.py)
SESSIONS: dict[str, Session] = {}

# Base upload directory
UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "upload")


def get_upload_dir(session_id: str) -> str:
    """Get the upload directory path for a session."""
    return os.path.join(UPLOAD_BASE, session_id)


def get_output_dir(session_id: str) -> str:
    """Get the output directory path for translated files."""
    return os.path.join(UPLOAD_BASE, session_id, "translated")


class AnswerRequest(BaseModel):
    """Request body for answering a question."""

    question_id: str
    answer: str


class SessionResponse(BaseModel):
    """Response model for session data (excludes sensitive LLM config)."""

    id: str
    source_lang: str
    target_lang: str
    description: Optional[str] = None
    status: str
    files: list[FileEntry]
    translated_files: list[FileEntry]
    created_at: datetime


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(request: CreateSessionRequest):
    """Create a new translation session."""
    import uuid

    session_id = uuid.uuid4().hex[:12]
    session = Session(
        id=session_id,
        llm_config=request.llm_config,
        source_lang=request.source_lang,
        target_lang=request.target_lang,
        description=request.description,
        status="created",
    )

    SESSIONS[session_id] = session

    # Create directories
    upload_dir = get_upload_dir(session_id)
    output_dir = get_output_dir(session_id)
    os.makedirs(upload_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    logger.info("Created session %s: %s -> %s", session_id, request.source_lang, request.target_lang)

    return SessionResponse(
        id=session.id,
        source_lang=session.source_lang,
        target_lang=session.target_lang,
        description=session.description,
        status=session.status,
        files=session.files,
        translated_files=session.translated_files,
        created_at=session.created_at,
    )


@router.post("/{session_id}/upload", response_model=SessionResponse)
async def upload_files(session_id: str, files: list[UploadFile] = File(...)):
    """Upload project files to a session.

    Supports both individual files and zip archives (auto-extract).
    """
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    upload_dir = get_upload_dir(session_id)
    os.makedirs(upload_dir, exist_ok=True)

    for upload_file in files:
        filename = upload_file.filename or "unknown"
        file_path = os.path.join(upload_dir, filename)

        # Ensure parent directories exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        # Write the uploaded file
        content = await upload_file.read()
        with open(file_path, "wb") as fh:
            fh.write(content)

        # Handle zip files
        if filename.lower().endswith(".zip"):
            try:
                extract_dir = os.path.join(upload_dir, filename.rsplit(".", 1)[0])
                os.makedirs(extract_dir, exist_ok=True)
                with zipfile.ZipFile(file_path, "r") as zf:
                    zf.extractall(extract_dir)
                # Remove the zip after extraction
                os.remove(file_path)
                logger.info("Extracted zip: %s -> %s", filename, extract_dir)
            except zipfile.BadZipFile:
                logger.warning("Bad zip file uploaded: %s", filename)
                raise HTTPException(status_code=400, detail=f"Invalid zip file: {filename}")

    # Rescan the upload directory to update the file list
    _rescan_files(session, upload_dir)

    logger.info("Uploaded %d file(s) to session %s", len(files), session_id)

    return SessionResponse(
        id=session.id,
        source_lang=session.source_lang,
        target_lang=session.target_lang,
        description=session.description,
        status=session.status,
        files=session.files,
        translated_files=session.translated_files,
        created_at=session.created_at,
    )


@router.get("/{session_id}/status")
async def get_session_status(session_id: str):
    """Get the current status of a session."""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return {
        "id": session.id,
        "status": session.status,
        "source_lang": session.source_lang,
        "target_lang": session.target_lang,
        "file_count": len(session.files),
        "translated_count": len(session.translated_files),
    }


@router.get("/{session_id}/files")
async def list_files(session_id: str):
    """List all files (source and translated) in a session."""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return {
        "source_files": [f.model_dump(exclude={"content"}) for f in session.files],
        "translated_files": [f.model_dump(exclude={"content"}) for f in session.translated_files],
    }


@router.get("/{session_id}/files/{file_path:path}")
async def get_file_content(session_id: str, file_path: str, translated: bool = False):
    """Get the content of a specific file.

    Query params:
        translated: If true, look in translated files; otherwise source files.
    """
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    file_list = session.translated_files if translated else session.files
    base_dir = get_output_dir(session_id) if translated else get_upload_dir(session_id)

    # Find the file in the session's file list
    for f in file_list:
        if f.path == file_path:
            content = f.content
            if content is None:
                # Read from disk
                full_path = os.path.join(base_dir, f.path)
                if os.path.isfile(full_path):
                    try:
                        with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                            content = fh.read()
                    except Exception as exc:
                        raise HTTPException(
                            status_code=500, detail=f"Error reading file: {exc}"
                        )
                else:
                    raise HTTPException(status_code=404, detail="File not found on disk")

            return {"path": f.path, "name": f.name, "language": f.language, "content": content}

    raise HTTPException(status_code=404, detail=f"File not found: {file_path}")


@router.post("/{session_id}/answer")
async def answer_question(session_id: str, request: AnswerRequest):
    """Submit an answer to a question posed by the translation agent."""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Store the answer in the session's pending answers
    # (The WebSocket handler will pick it up)
    if not hasattr(session, "_pending_answers"):
        session._pending_answers = {}  # type: ignore[attr-defined]

    session._pending_answers[request.question_id] = request.answer  # type: ignore[attr-defined]

    logger.info("Answer received for session %s, question %s", session_id, request.question_id)

    return {"status": "ok", "question_id": request.question_id}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its files."""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Remove files
    upload_dir = get_upload_dir(session_id)
    if os.path.isdir(upload_dir):
        shutil.rmtree(upload_dir, ignore_errors=True)

    # Remove session
    del SESSIONS[session_id]

    logger.info("Deleted session %s", session_id)

    return {"status": "ok", "message": f"Session {session_id} deleted"}


def _rescan_files(session: Session, upload_dir: str) -> None:
    """Rescan the upload directory and update the session's file list.

    Args:
        session: The session to update.
        upload_dir: Path to the upload directory.
    """
    files: list[FileEntry] = []

    if not os.path.isdir(upload_dir):
        return

    skip_dirs = {
        "node_modules", ".git", "__pycache__", ".venv", "venv",
        "dist", "build", ".next", ".nuxt", "target", "translated",
    }

    for root, dirs, filenames in os.walk(upload_dir):
        # Prune skip directories
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]

        for filename in filenames:
            if filename.startswith("."):
                continue

            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, upload_dir)
            _, ext = os.path.splitext(filename)
            language = EXTENSION_MAP.get(ext.lower(), "Unknown")

            try:
                size = os.path.getsize(full_path)
            except OSError:
                size = 0

            files.append(
                FileEntry(
                    name=filename,
                    path=rel_path,
                    size=size,
                    language=language,
                )
            )

    session.files = files
