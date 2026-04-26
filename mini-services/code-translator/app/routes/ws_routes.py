"""WebSocket routes for real-time communication with the CodeTranslator Agent."""

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models import Session
from app.routes.session_routes import SESSIONS, get_output_dir, get_upload_dir
from app.services.analysis_service import AnalysisService
from app.services.llm_service import LLMService
from app.services.search_service import SearchService
from app.services.translation_service import TranslationService
from app.services.verification_service import VerificationService

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and message routing."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.pending_answers: dict[str, asyncio.Future] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info("WebSocket connected for session %s", session_id)

    def disconnect(self, session_id: str):
        """Remove a WebSocket connection."""
        self.active_connections.pop(session_id, None)
        # Cancel any pending answer futures
        for qid, future in list(self.pending_answers.items()):
            if qid.startswith(session_id):
                if not future.done():
                    future.cancel()
                del self.pending_answers[qid]
        logger.info("WebSocket disconnected for session %s", session_id)

    async def send_message(self, session_id: str, message: dict[str, Any]) -> None:
        """Send a message to the WebSocket for a given session.

        Args:
            session_id: The session ID.
            message: The message dictionary to send.
        """
        websocket = self.active_connections.get(session_id)
        if websocket:
            try:
                await websocket.send_json(message)
            except Exception as exc:
                logger.error("Failed to send WebSocket message: %s", exc)

    def register_question(self, session_id: str, question_id: str) -> asyncio.Future:
        """Register a question and return a Future that will be resolved with the answer.

        Args:
            session_id: The session ID.
            question_id: The question ID.

        Returns:
            An asyncio.Future that will contain the user's answer.
        """
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        key = f"{session_id}:{question_id}"
        self.pending_answers[key] = future
        return future

    def resolve_answer(self, session_id: str, question_id: str, answer: str) -> None:
        """Resolve a pending question with the user's answer.

        Args:
            session_id: The session ID.
            question_id: The question ID.
            answer: The user's answer.
        """
        key = f"{session_id}:{question_id}"
        future = self.pending_answers.pop(key, None)
        if future and not future.done():
            future.set_result(answer)
            logger.info("Resolved answer for question %s", question_id)


manager = ConnectionManager()


async def create_send_message_callback(session_id: str):
    """Create a send_message callback bound to a session.

    Args:
        session_id: The session ID.

    Returns:
        An async callback function for sending WebSocket messages.
    """

    async def send_message(message: dict[str, Any]) -> None:
        await manager.send_message(session_id, message)

    return send_message


async def create_wait_for_answer_callback(session_id: str):
    """Create a wait_for_answer callback bound to a session.

    Args:
        session_id: The session ID.

    Returns:
        An async callback function that waits for user answers.
    """

    async def wait_for_answer(question_id: str) -> str:
        future = manager.register_question(session_id, question_id)
        try:
            # Wait up to 5 minutes for an answer
            return await asyncio.wait_for(future, timeout=300.0)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for answer to question %s", question_id)
            return ""

    return wait_for_answer


async def run_analysis(session_id: str, session: Session) -> None:
    """Run the analysis phase for a session.

    Args:
        session_id: The session ID.
        session: The session object.
    """
    send_message = await create_send_message_callback(session_id)

    try:
        session.status = "analyzing"
        await send_message({
            "type": "status",
            "phase": "analyzing",
            "message": "Starting project analysis...",
        })

        llm = LLMService(
            base_url=session.llm_config.base_url,
            api_key=session.llm_config.api_key,
            model_name=session.llm_config.model_name,
        )
        search = SearchService()
        analysis_service = AnalysisService(llm_service=llm, search_service=search)

        upload_dir = get_upload_dir(session_id)

        # Rescan files if empty
        if not session.files:
            from app.routes.session_routes import _rescan_files
            _rescan_files(session, upload_dir)

        analysis = await analysis_service.analyze_project(
            upload_dir=upload_dir,
            files=session.files,
            source_lang=session.source_lang,
            target_lang=session.target_lang,
            description=session.description,
        )

        session.analysis = analysis
        session.status = "analyzed"

        await send_message({
            "type": "analysis_result",
            "data": analysis,
        })

    except Exception as exc:
        logger.error("Analysis failed for session %s: %s", session_id, exc)
        session.status = "error"
        await send_message({
            "type": "error",
            "message": f"Analysis failed: {exc}",
        })


async def run_translation(session_id: str, session: Session) -> None:
    """Run the translation phase for a session.

    Args:
        session_id: The session ID.
        session: The session object.
    """
    send_message = await create_send_message_callback(session_id)
    wait_for_answer = await create_wait_for_answer_callback(session_id)

    try:
        session.status = "translating"
        await send_message({
            "type": "status",
            "phase": "translating",
            "message": "Starting code translation...",
        })

        llm = LLMService(
            base_url=session.llm_config.base_url,
            api_key=session.llm_config.api_key,
            model_name=session.llm_config.model_name,
        )
        search = SearchService()

        translation_service = TranslationService(
            llm_service=llm,
            search_service=search,
            send_message=send_message,
            wait_for_answer=wait_for_answer,
        )

        upload_dir = get_upload_dir(session_id)
        output_dir = get_output_dir(session_id)
        os.makedirs(output_dir, exist_ok=True)

        translated_files = await translation_service.translate_project(
            upload_dir=upload_dir,
            files=session.files,
            analysis=session.analysis or {},
            source_lang=session.source_lang,
            target_lang=session.target_lang,
            output_dir=output_dir,
            description=session.description,
        )

        session.translated_files = translated_files

        if translated_files:
            session.status = "translated"
            await send_message({
                "type": "status",
                "phase": "translated",
                "message": f"Translation complete! ({len(translated_files)} file(s) translated)",
            })
        else:
            session.status = "error"
            await send_message({
                "type": "error",
                "message": "Translation failed: No files were successfully translated",
            })

    except Exception as exc:
        logger.error("Translation failed for session %s: %s", session_id, exc)
        session.status = "error"
        await send_message({
            "type": "error",
            "message": f"Translation failed: {exc}",
        })


async def run_verification(session_id: str, session: Session) -> None:
    """Run the verification phase for a session.

    Args:
        session_id: The session ID.
        session: The session object.
    """
    send_message = await create_send_message_callback(session_id)

    try:
        session.status = "verifying"
        await send_message({
            "type": "status",
            "phase": "verifying",
            "message": "Starting verification...",
        })

        llm = LLMService(
            base_url=session.llm_config.base_url,
            api_key=session.llm_config.api_key,
            model_name=session.llm_config.model_name,
        )

        verification_service = VerificationService(
            llm_service=llm,
            send_message=send_message,
        )

        upload_dir = get_upload_dir(session_id)
        output_dir = get_output_dir(session_id)

        summary = await verification_service.verify_translations(
            source_files=session.files,
            translated_files=session.translated_files,
            upload_dir=upload_dir,
            output_dir=output_dir,
            source_lang=session.source_lang,
            target_lang=session.target_lang,
        )

        session.verification_summary = summary
        session.status = "completed"

        await send_message({
            "type": "complete",
            "message": "Translation and verification complete!",
        })

    except Exception as exc:
        logger.error("Verification failed for session %s: %s", session_id, exc)
        session.status = "error"
        await send_message({
            "type": "error",
            "message": f"Verification failed: {exc}",
        })


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time communication.

    Handles the following client message types:
    - start_analysis: Begin project analysis
    - start_translation: Begin code translation
    - start_verification: Begin verification
    - answer: Answer a question from the agent
    """
    session = SESSIONS.get(session_id)
    if not session:
        await websocket.close(code=4004, reason=f"Session {session_id} not found")
        return

    await manager.connect(session_id, websocket)

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_message(session_id, {
                    "type": "error",
                    "message": "Invalid JSON message",
                })
                continue

            msg_type = message.get("type", "")

            if msg_type == "start_analysis":
                # Run analysis as a background task
                asyncio.create_task(run_analysis(session_id, session))

            elif msg_type == "start_translation":
                # Ensure analysis has been done
                if not session.analysis:
                    await manager.send_message(session_id, {
                        "type": "error",
                        "message": "Please run analysis first before translation",
                    })
                    continue
                asyncio.create_task(run_translation(session_id, session))

            elif msg_type == "start_verification":
                # Ensure translation has been done
                if not session.translated_files:
                    await manager.send_message(session_id, {
                        "type": "error",
                        "message": "Please run translation first before verification",
                    })
                    continue
                asyncio.create_task(run_verification(session_id, session))

            elif msg_type == "answer":
                question_id = message.get("question_id", "")
                answer = message.get("answer", "")
                manager.resolve_answer(session_id, question_id, answer)

            else:
                await manager.send_message(session_id, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        manager.disconnect(session_id)
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc)
        manager.disconnect(session_id)
