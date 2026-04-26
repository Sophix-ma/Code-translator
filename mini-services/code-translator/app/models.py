"""Pydantic models for the CodeTranslator Agent service."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """Configuration for an OpenAI-compatible LLM API."""

    base_url: str = Field(..., description="Base URL of the OpenAI-compatible API")
    api_key: str = Field(..., description="API key for authentication")
    model_name: str = Field(..., description="Model name to use for completions")


class CreateSessionRequest(BaseModel):
    """Request body for creating a new translation session."""

    llm_config: LLMConfig
    source_lang: str = Field(..., description="Source programming language")
    target_lang: str = Field(..., description="Target programming language")
    description: Optional[str] = Field(
        None, description="Optional description of the translation goal"
    )


class FileEntry(BaseModel):
    """Represents a file in the project (source or translated)."""

    name: str = Field(..., description="File name")
    path: str = Field(..., description="Relative path within the project")
    size: int = Field(0, description="File size in bytes")
    language: str = Field("", description="Programming language of the file")
    is_translated: bool = Field(False, description="Whether the file has been translated")
    content: Optional[str] = Field(None, description="File content (optional)")


class Message(BaseModel):
    """A chat message in the conversation history."""

    role: str = Field(..., description="Role: system, assistant, or user")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class Question(BaseModel):
    """A question posed to the user during translation."""

    id: str = Field(..., description="Unique question identifier")
    question: str = Field(..., description="The question text")
    options: Optional[list[str]] = Field(
        None, description="Optional list of suggested answers"
    )


class Session(BaseModel):
    """A translation session with all its state."""

    id: str = Field(..., description="Unique session identifier")
    llm_config: LLMConfig
    source_lang: str
    target_lang: str
    description: Optional[str] = None
    status: str = Field("created", description="Session status")
    files: list[FileEntry] = Field(default_factory=list)
    translated_files: list[FileEntry] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    analysis: Optional[dict] = Field(None, description="Project analysis result")
    verification_summary: Optional[dict] = Field(
        None, description="Verification summary result"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- WebSocket message models ---


class WSMessage(BaseModel):
    """Generic WebSocket message envelope."""

    type: str = Field(..., description="Message type")


class WSSendMessage(WSMessage):
    """WebSocket message from client to server."""

    question_id: Optional[str] = None
    answer: Optional[str] = None


class WSServerMessage(WSMessage):
    """WebSocket message from server to client."""

    message: Optional[str] = None
    data: Optional[dict] = None


class WSStatusMessage(WSServerMessage):
    """Status update message."""

    phase: Optional[str] = None


class WSTranslationProgress(WSServerMessage):
    """Translation progress message."""

    file: Optional[str] = None
    progress: Optional[float] = None


class WSQuestionMessage(WSServerMessage):
    """Question to user message."""

    question_id: Optional[str] = None
    question: Optional[str] = None
    options: Optional[list[str]] = None


class WSSearchMessage(WSServerMessage):
    """Search-related message."""

    query: Optional[str] = None
    results: Optional[list[dict]] = None


class WSFileTranslatedMessage(WSServerMessage):
    """File translated notification."""

    file: Optional[str] = None
    translated_file: Optional[str] = None
    content: Optional[str] = None


class WSVerificationProgress(WSServerMessage):
    """Verification progress message."""

    file: Optional[str] = None


class WSVerificationIssue(WSServerMessage):
    """Verification issue found."""

    file: Optional[str] = None
    issue: Optional[str] = None
    severity: Optional[str] = None


class WSVerificationComplete(WSServerMessage):
    """Verification complete message."""

    summary: Optional[dict] = None
