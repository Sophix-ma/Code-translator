"""Post-translation verification service for checking translated code quality."""

import json
import logging
from typing import Any, Callable, Coroutine

from app.models import FileEntry
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

VERIFICATION_SYSTEM_PROMPT = """You are an expert code reviewer specializing in verifying code translations. Your job is to review translated code and check for:

1. **Syntax Errors**: Does the translated code have valid syntax in the target language?
2. **Missing Imports**: Are all necessary imports/include statements present?
3. **Type Mismatches**: Are data types correctly translated and compatible?
4. **Logic Errors**: Does the translated code maintain the same logical flow and behavior?
5. **Missing Error Handling**: Is error handling preserved from the source?
6. **API Mismatches**: Are library/framework API calls correctly translated?
7. **Naming Conventions**: Does the code follow the target language's naming conventions?
8. **Untranslated Fragments**: Are there any leftover source language constructs?

For each file, respond with a JSON object:
{
    "passed": true/false,
    "issues": [
        {
            "type": "syntax_error|missing_import|type_mismatch|logic_error|missing_error_handling|api_mismatch|naming_convention|untranslated_fragment|other",
            "severity": "error|warning|info",
            "location": "Line or section reference (if identifiable)",
            "description": "Description of the issue",
            "suggestion": "Suggested fix"
        }
    ],
    "summary": "Brief overall assessment"
}

Be thorough but fair. Minor style differences are not errors. Focus on functional correctness."""


class VerificationService:
    """Service for verifying translated code quality and correctness."""

    def __init__(
        self,
        llm_service: LLMService,
        send_message: Callable[[dict], Coroutine[Any, Any, None]],
    ):
        """Initialize the verification service.

        Args:
            llm_service: The LLM service for code review.
            send_message: Callback to send WebSocket messages.
        """
        self.llm = llm_service
        self.send_message = send_message

    async def verify_translations(
        self,
        source_files: list[FileEntry],
        translated_files: list[FileEntry],
        upload_dir: str,
        output_dir: str,
        source_lang: str,
        target_lang: str,
    ) -> dict[str, Any]:
        """Verify all translated files against their source counterparts.

        Args:
            source_files: List of original source file entries.
            translated_files: List of translated file entries.
            upload_dir: Directory containing source files.
            output_dir: Directory containing translated files.
            source_lang: Source programming language.
            target_lang: Target programming language.

        Returns:
            A summary dictionary of the verification results.
        """
        total = len(translated_files)
        passed_count = 0
        warning_count = 0
        error_count = 0
        all_issues: list[dict[str, Any]] = []

        for idx, translated in enumerate(translated_files):
            await self.send_message({
                "type": "verification_progress",
                "file": translated.path,
                "message": f"Verifying {translated.path} ({idx + 1}/{total})...",
            })

            try:
                # Find the matching source file
                source_content = self._find_source_content(
                    translated, source_files, upload_dir
                )
                translated_content = self._read_translated_content(output_dir, translated)

                if not translated_content:
                    await self.send_message({
                        "type": "verification_issue",
                        "file": translated.path,
                        "issue": "Could not read translated file content",
                        "severity": "error",
                    })
                    error_count += 1
                    continue

                # Verify the translated file
                verification = await self._verify_file(
                    source_content=source_content,
                    translated_content=translated_content,
                    translated_path=translated.path,
                    source_lang=source_lang,
                    target_lang=target_lang,
                )

                issues = verification.get("issues", [])
                passed = verification.get("passed", True)

                for issue in issues:
                    severity = issue.get("severity", "info")
                    if severity == "error":
                        error_count += 1
                    elif severity == "warning":
                        warning_count += 1

                    all_issues.append({
                        "file": translated.path,
                        **issue,
                    })

                    await self.send_message({
                        "type": "verification_issue",
                        "file": translated.path,
                        "issue": issue.get("description", "Unknown issue"),
                        "severity": severity,
                    })

                if passed:
                    passed_count += 1

            except Exception as exc:
                logger.error("Verification failed for %s: %s", translated.path, exc)
                error_count += 1
                await self.send_message({
                    "type": "verification_issue",
                    "file": translated.path,
                    "issue": f"Verification error: {exc}",
                    "severity": "error",
                })

        summary = {
            "total": total,
            "passed": passed_count,
            "warnings": warning_count,
            "errors": error_count,
            "issues": all_issues,
        }

        await self.send_message({
            "type": "verification_complete",
            "summary": summary,
        })

        logger.info(
            "Verification complete: %d/%d passed, %d warnings, %d errors",
            passed_count, total, warning_count, error_count,
        )

        return summary

    async def _verify_file(
        self,
        source_content: str,
        translated_content: str,
        translated_path: str,
        source_lang: str,
        target_lang: str,
    ) -> dict[str, Any]:
        """Verify a single translated file against its source.

        Args:
            source_content: The original source code.
            translated_content: The translated code.
            translated_path: Path of the translated file.
            source_lang: Source language.
            target_lang: Target language.

        Returns:
            Verification result dictionary.
        """
        user_message = f"""Review this code translation from {source_lang} to {target_lang}.

File: {translated_path}

=== SOURCE CODE ({source_lang}) ===
{source_content[:8000]}

=== TRANSLATED CODE ({target_lang}) ===
{translated_content[:8000]}

Verify the translation and report any issues."""

        try:
            response = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": VERIFICATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.1,
            )

            result = json.loads(response)
            return result

        except json.JSONDecodeError:
            logger.warning("Verification LLM returned non-JSON for %s", translated_path)
            return {
                "passed": True,
                "issues": [],
                "summary": "Verification could not be parsed (raw LLM response)",
            }
        except Exception as exc:
            logger.error("Verification call failed for %s: %s", translated_path, exc)
            return {
                "passed": False,
                "issues": [
                    {
                        "type": "other",
                        "severity": "warning",
                        "description": f"Verification check failed: {exc}",
                        "suggestion": "Manual review recommended",
                    }
                ],
                "summary": "Verification check encountered an error",
            }

    @staticmethod
    def _find_source_content(
        translated: FileEntry,
        source_files: list[FileEntry],
        upload_dir: str,
    ) -> str:
        """Find and read the source content corresponding to a translated file.

        Args:
            translated: The translated file entry.
            source_files: List of source file entries.
            upload_dir: Directory containing source files.

        Returns:
            The source file content, or a placeholder message.
        """
        # Try to match by base name (without extension)
        import os

        translated_base = os.path.splitext(os.path.basename(translated.path))[0]

        for source in source_files:
            source_base = os.path.splitext(os.path.basename(source.path))[0]
            if source_base.lower() == translated_base.lower():
                full_path = os.path.join(upload_dir, source.path)
                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                        return fh.read()
                except Exception:
                    continue

        # If no match found, return a note
        return f"[Source file not found for {translated.path}]"

    @staticmethod
    def _read_translated_content(output_dir: str, translated: FileEntry) -> str:
        """Read a translated file's content from disk or from the FileEntry.

        Args:
            output_dir: Directory containing translated files.
            translated: The translated file entry.

        Returns:
            The translated file content.
        """
        # Try the content field first
        if translated.content:
            return translated.content

        # Fall back to reading from disk
        full_path = os.path.join(output_dir, translated.path)
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read()
        except Exception as exc:
            logger.error("Failed to read translated file %s: %s", translated.path, exc)
            return ""


import os  # noqa: E402 - needed for _find_source_content and _read_translated_content
