"""Code analysis service for understanding uploaded project structure."""

import json
import logging
import os
from typing import Any

from app.models import FileEntry
from app.services.llm_service import LLMService
from app.services.search_service import SearchService

logger = logging.getLogger(__name__)

# File extension to language mapping
EXTENSION_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "JavaScript (React)",
    ".tsx": "TypeScript (React)",
    ".java": "Java",
    ".kt": "Kotlin",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".swift": "Swift",
    ".scala": "Scala",
    ".r": "R",
    ".m": "Objective-C",
    ".sh": "Shell",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".md": "Markdown",
}

# Directories to skip during analysis
SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "bin",
    "obj",
    ".idea",
    ".vscode",
    ".DS_Store",
}

ANALYSIS_SYSTEM_PROMPT = """You are an expert code analyst. Your job is to analyze a software project and provide a comprehensive summary.

Given the project files and their contents, produce a JSON analysis with the following structure:
{
    "summary": "A concise description of what the project does",
    "purpose": "The main purpose/goal of the project",
    "architecture": "Description of the project architecture and how components interact",
    "languages": ["List of programming languages used"],
    "frameworks": ["List of frameworks and libraries detected"],
    "entry_points": ["List of main entry point files"],
    "key_modules": ["List of key modules/components and their responsibilities"],
    "dependencies": ["List of external dependencies"],
    "patterns": ["List of design patterns and coding patterns used"],
    "complexity": "low/medium/high - overall project complexity assessment",
    "translation_considerations": ["List of important considerations for translating this project to another language"]
}

Be thorough and specific. Focus on aspects that would matter for code translation."""


class AnalysisService:
    """Service for analyzing uploaded project code."""

    def __init__(self, llm_service: LLMService, search_service: SearchService):
        self.llm = llm_service
        self.search = search_service

    def scan_files(self, upload_dir: str) -> list[FileEntry]:
        """Scan a directory and return a list of FileEntry objects.

        Args:
            upload_dir: Path to the uploaded project directory.

        Returns:
            List of FileEntry objects for all discoverable files.
        """
        files: list[FileEntry] = []

        if not os.path.isdir(upload_dir):
            logger.warning("Upload directory does not exist: %s", upload_dir)
            return files

        for root, dirs, filenames in os.walk(upload_dir):
            # Prune directories we want to skip
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]

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

        logger.info("Scanned %d files in %s", len(files), upload_dir)
        return files

    def read_file_content(self, upload_dir: str, rel_path: str, max_size: int = 100_000) -> str:
        """Read a file's content, with a size limit.

        Args:
            upload_dir: Root directory of the uploaded project.
            rel_path: Relative path to the file.
            max_size: Maximum file size to read (in bytes).

        Returns:
            The file content as a string, or an empty string if unreadable/too large.
        """
        full_path = os.path.join(upload_dir, rel_path)
        try:
            if os.path.getsize(full_path) > max_size:
                return f"[File too large to include: {os.path.getsize(full_path)} bytes]"
            with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read()
        except Exception as exc:
            logger.warning("Could not read file %s: %s", rel_path, exc)
            return f"[Error reading file: {exc}]"

    async def analyze_project(
        self,
        upload_dir: str,
        files: list[FileEntry],
        source_lang: str,
        target_lang: str,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Analyze the entire project and return a structured analysis.

        Args:
            upload_dir: Root directory of the uploaded project.
            files: List of FileEntry objects.
            source_lang: Source programming language.
            target_lang: Target programming language.
            description: Optional user-provided description.

        Returns:
            A dictionary containing the project analysis.
        """
        # Build the project context for the LLM
        file_contents = self._build_project_context(upload_dir, files)

        user_message = f"""Analyze the following project written in {source_lang}.
The user wants to translate it to {target_lang}.
{"User description: " + description if description else ""}

Project files:
{file_contents}"""

        try:
            response = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.1,
            )

            analysis = json.loads(response)
            logger.info("Project analysis complete: %s", analysis.get("summary", "N/A"))
            return analysis

        except json.JSONDecodeError:
            logger.warning("LLM did not return valid JSON for analysis, using raw response")
            return {
                "summary": response if "response" in dir() else "Analysis failed",
                "raw_response": response if "response" in dir() else "",
            }
        except Exception as exc:
            logger.error("Project analysis failed: %s", exc)
            return {"summary": f"Analysis failed: {exc}", "error": str(exc)}

    def _build_project_context(
        self, upload_dir: str, files: list[FileEntry], max_files: int = 50
    ) -> str:
        """Build a text representation of the project for the LLM.

        Args:
            upload_dir: Root directory of the uploaded project.
            files: List of FileEntry objects.
            max_files: Maximum number of files to include.

        Returns:
            A formatted string containing the project structure and file contents.
        """
        lines: list[str] = []
        lines.append("=== Project Structure ===")

        # Sort files by path for consistent ordering
        sorted_files = sorted(files, key=lambda f: f.path)

        for entry in sorted_files[:max_files]:
            lines.append(f"\n--- {entry.path} ({entry.language}) ---")
            content = self.read_file_content(upload_dir, entry.path)
            # Truncate very long files in the context
            if len(content) > 5000:
                content = content[:5000] + "\n... [truncated]"
            lines.append(content)

        if len(sorted_files) > max_files:
            lines.append(
                f"\n... and {len(sorted_files) - max_files} more files (omitted for brevity)"
            )

        return "\n".join(lines)

    async def search_for_context(self, query: str) -> list[dict[str, Any]]:
        """Search the web for additional context about a language or framework.

        Args:
            query: The search query.

        Returns:
            List of search result dictionaries.
        """
        results = await self.search.search(query)
        return results
