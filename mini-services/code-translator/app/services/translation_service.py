"""Core translation service for converting code between programming languages."""

import json
import logging
import os
import uuid
from typing import Any, Callable, Coroutine

from app.models import FileEntry, Question
from app.services.llm_service import LLMService
from app.services.search_service import SearchService

logger = logging.getLogger(__name__)

TRANSLATION_SYSTEM_PROMPT = """You are an expert code translator. Your task is to translate code from one programming language to another while preserving functionality and following the target language's idioms and best practices.

Guidelines:
1. Preserve the exact functionality and behavior of the original code.
2. Use idiomatic patterns and conventions of the target language.
3. Maintain proper error handling equivalent to the original.
4. Translate comments and documentation, preserving their meaning.
5. Map data types, control structures, and APIs to appropriate target language equivalents.
6. Ensure proper import statements and dependency management.
7. Keep the same project structure where possible, adjusting for target language conventions.
8. If the original uses a framework or library, translate to an equivalent in the target language or the closest match.
9. Return ONLY the translated code without markdown fences or explanations, unless specifically asked."""

NEEDS_SEARCH_PROMPT = """You are analyzing whether a code translation question requires web search for accurate results.

Given the source code, target language, and the translation context, determine if you need to search the web for:
- Language-specific syntax or API patterns
- Framework equivalents or migration guides
- Library compatibility or replacement options
- Best practices in the target language

Respond with a JSON object:
{
    "needs_search": true/false,
    "search_queries": ["list of search queries if needed"],
    "reason": "Brief explanation of why search is/isn't needed"
}"""

NEEDS_QUESTION_PROMPT = """You are determining whether a code translation requires clarification from the user.

Given the source code, target language, and context, determine if there are ambiguous choices that require user input, such as:
- Multiple framework options with no clear best choice
- Architecture decisions (e.g., async vs sync, OOP vs functional)
- Dependency choices (e.g., which HTTP client library to use)
- Naming conventions or style preferences

Respond with a JSON object:
{
    "needs_question": true/false,
    "question": "The question to ask the user (if needed)",
    "options": ["List of suggested options (if applicable)"],
    "reason": "Brief explanation of why this question is needed"
}"""


class TranslationService:
    """Service for translating code between programming languages."""

    def __init__(
        self,
        llm_service: LLMService,
        search_service: SearchService,
        send_message: Callable[[dict], Coroutine[Any, Any, None]],
        wait_for_answer: Callable[[str], Coroutine[Any, Any, str]],
    ):
        """Initialize the translation service.

        Args:
            llm_service: The LLM service for code generation.
            search_service: The web search service.
            send_message: Callback to send WebSocket messages to the client.
            wait_for_answer: Callback to wait for a user answer to a question.
        """
        self.llm = llm_service
        self.search = search_service
        self.send_message = send_message
        self.wait_for_answer = wait_for_answer

    async def translate_project(
        self,
        upload_dir: str,
        files: list[FileEntry],
        analysis: dict[str, Any],
        source_lang: str,
        target_lang: str,
        output_dir: str,
        description: str | None = None,
    ) -> list[FileEntry]:
        """Translate all project files from source to target language.

        Args:
            upload_dir: Directory containing source files.
            files: List of source file entries.
            analysis: Project analysis results.
            source_lang: Source programming language.
            target_lang: Target programming language.
            output_dir: Directory to write translated files.
            description: Optional user-provided description.

        Returns:
            List of FileEntry objects for the translated files.
        """
        translatable_files = [f for f in files if self._is_translatable(f)]
        total = len(translatable_files)
        translated_files: list[FileEntry] = []

        # Build shared context from the analysis
        project_context = self._build_translation_context(analysis, source_lang, target_lang, description)

        # Check if we need to search or ask questions before starting
        await self._pre_translation_check(translatable_files, source_lang, target_lang, project_context)

        for idx, file_entry in enumerate(translatable_files):
            progress = (idx + 1) / total if total > 0 else 1.0

            await self.send_message({
                "type": "translation_progress",
                "file": file_entry.path,
                "progress": round(progress, 2),
                "message": f"Translating {file_entry.path} ({idx + 1}/{total})...",
            })

            try:
                # Read the source file
                source_content = self._read_source_file(upload_dir, file_entry.path)
                if not source_content:
                    logger.warning("Skipping empty/unreadable file: %s", file_entry.path)
                    continue

                # Check if this specific file needs search
                search_context = await self._check_and_search(
                    source_content, file_entry, source_lang, target_lang
                )

                # Check if this file needs user clarification
                await self._check_and_ask(
                    source_content, file_entry, source_lang, target_lang
                )

                # Translate the file
                translated_content = await self._translate_file(
                    source_content=source_content,
                    file_entry=file_entry,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    project_context=project_context,
                    search_context=search_context,
                )

                # Determine the translated file path
                translated_path = self._get_translated_path(file_entry.path, source_lang, target_lang)

                # Write the translated file
                full_output_path = os.path.join(output_dir, translated_path)
                os.makedirs(os.path.dirname(full_output_path), exist_ok=True)
                with open(full_output_path, "w", encoding="utf-8") as fh:
                    fh.write(translated_content)

                translated_entry = FileEntry(
                    name=os.path.basename(translated_path),
                    path=translated_path,
                    size=len(translated_content.encode("utf-8")),
                    language=target_lang,
                    is_translated=True,
                    content=translated_content,
                )
                translated_files.append(translated_entry)

                await self.send_message({
                    "type": "file_translated",
                    "file": file_entry.path,
                    "translated_file": translated_path,
                    "content": translated_content,
                })

            except Exception as exc:
                logger.error("Error translating %s: %s", file_entry.path, exc)
                await self.send_message({
                    "type": "error",
                    "message": f"Failed to translate {file_entry.path}: {exc}",
                })

        return translated_files

    async def _translate_file(
        self,
        source_content: str,
        file_entry: FileEntry,
        source_lang: str,
        target_lang: str,
        project_context: str,
        search_context: str = "",
    ) -> str:
        """Translate a single file.

        Args:
            source_content: The source code content.
            file_entry: The source file entry.
            source_lang: Source programming language.
            target_lang: Target programming language.
            project_context: Context about the overall project.
            search_context: Additional context from web searches.

        Returns:
            The translated code content.
        """
        messages = [
            {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
            {"role": "user", "content": self._build_translation_prompt(
                source_content=source_content,
                file_path=file_entry.path,
                source_lang=source_lang,
                target_lang=target_lang,
                project_context=project_context,
                search_context=search_context,
            )},
        ]

        response = await self.llm.chat(messages, temperature=0.2)

        # Clean up markdown fences if present
        cleaned = self._strip_code_fences(response)
        return cleaned

    def _build_translation_prompt(
        self,
        source_content: str,
        file_path: str,
        source_lang: str,
        target_lang: str,
        project_context: str,
        search_context: str = "",
    ) -> str:
        """Build the translation prompt for a single file.

        Args:
            source_content: The source code.
            file_path: Path of the file being translated.
            source_lang: Source language.
            target_lang: Target language.
            project_context: Project-level context.
            search_context: Context from web searches.

        Returns:
            The formatted translation prompt.
        """
        parts = [
            f"Translate the following {source_lang} code to {target_lang}.",
            f"\nFile: {file_path}",
            f"\nProject Context:\n{project_context}",
        ]

        if search_context:
            parts.append(f"\nAdditional Reference (from web search):\n{search_context}")

        parts.append(f"\nSource Code:\n```{source_lang}\n{source_content}\n```")
        parts.append(f"\nProvide the translated {target_lang} code:")

        return "\n".join(parts)

    def _build_translation_context(
        self,
        analysis: dict[str, Any],
        source_lang: str,
        target_lang: str,
        description: str | None = None,
    ) -> str:
        """Build shared translation context from project analysis.

        Args:
            analysis: The project analysis result.
            source_lang: Source language.
            target_lang: Target language.
            description: Optional user description.

        Returns:
            A formatted context string.
        """
        parts: list[str] = []

        if analysis.get("summary"):
            parts.append(f"Project Summary: {analysis['summary']}")
        if analysis.get("architecture"):
            parts.append(f"Architecture: {analysis['architecture']}")
        if analysis.get("frameworks"):
            parts.append(f"Frameworks: {', '.join(analysis['frameworks'])}")
        if analysis.get("dependencies"):
            parts.append(f"Dependencies: {', '.join(analysis['dependencies'])}")
        if analysis.get("patterns"):
            parts.append(f"Patterns: {', '.join(analysis['patterns'])}")
        if analysis.get("translation_considerations"):
            parts.append(f"Translation Considerations: {', '.join(analysis['translation_considerations'])}")
        if description:
            parts.append(f"User Description: {description}")

        parts.append(f"Source Language: {source_lang}")
        parts.append(f"Target Language: {target_lang}")

        return "\n".join(parts)

    async def _pre_translation_check(
        self,
        files: list[FileEntry],
        source_lang: str,
        target_lang: str,
        project_context: str,
    ) -> None:
        """Check if the overall translation needs web search or user input.

        Args:
            files: List of translatable files.
            source_lang: Source language.
            target_lang: Target language.
            project_context: Project-level context.
        """
        # Check for search needs
        sample_files = files[:3]  # Check a sample of files
        for f in sample_files:
            search_context = await self._check_and_search(
                f"[Content of {f.path}]", f, source_lang, target_lang
            )
            if search_context:
                # We've done a search; that's enough for the pre-check
                break

    async def _check_and_search(
        self,
        source_content: str,
        file_entry: FileEntry,
        source_lang: str,
        target_lang: str,
    ) -> str:
        """Check if we need to search the web and perform search if needed.

        Args:
            source_content: Source code content.
            file_entry: The file being translated.
            source_lang: Source language.
            target_lang: Target language.

        Returns:
            Additional context from search results, or empty string.
        """
        try:
            check_prompt = f"""Source language: {source_lang}
Target language: {target_lang}
File: {file_entry.path}

Source code (first 2000 chars):
{source_content[:2000]}"""

            response = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": NEEDS_SEARCH_PROMPT},
                    {"role": "user", "content": check_prompt},
                ],
                temperature=0.1,
            )

            result = json.loads(response)
            needs_search = result.get("needs_search", False)
            queries = result.get("search_queries", [])

            if not needs_search or not queries:
                return ""

            all_results: list[str] = []
            for query in queries:
                await self.send_message({
                    "type": "searching",
                    "query": query,
                })

                search_results = await self.search.search(query)
                if search_results:
                    await self.send_message({
                        "type": "search_result",
                        "query": query,
                        "results": search_results,
                    })
                    # Format search results for context
                    formatted = self._format_search_results(query, search_results)
                    all_results.append(formatted)

            return "\n\n".join(all_results)

        except Exception as exc:
            logger.warning("Search check failed: %s", exc)
            return ""

    async def _check_and_ask(
        self,
        source_content: str,
        file_entry: FileEntry,
        source_lang: str,
        target_lang: str,
    ) -> None:
        """Check if we need to ask the user a question and wait for the answer.

        Args:
            source_content: Source code content.
            file_entry: The file being translated.
            source_lang: Source language.
            target_lang: Target language.
        """
        try:
            check_prompt = f"""Source language: {source_lang}
Target language: {target_lang}
File: {file_entry.path}

Source code (first 2000 chars):
{source_content[:2000]}"""

            response = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": NEEDS_QUESTION_PROMPT},
                    {"role": "user", "content": check_prompt},
                ],
                temperature=0.1,
            )

            result = json.loads(response)
            needs_question = result.get("needs_question", False)

            if not needs_question:
                return

            question_text = result.get("question", "No question provided")
            options = result.get("options")
            question_id = f"q_{uuid.uuid4().hex[:8]}"

            question = Question(
                id=question_id,
                question=question_text,
                options=options,
            )

            await self.send_message({
                "type": "question",
                "question_id": question.id,
                "question": question.question,
                "options": question.options,
            })

            # Wait for the user's answer
            answer = await self.wait_for_answer(question.id)
            logger.info("User answered question %s: %s", question_id, answer)

        except Exception as exc:
            logger.warning("Question check failed: %s", exc)

    def _format_search_results(self, query: str, results: list[dict]) -> str:
        """Format search results into a readable context string.

        Args:
            query: The search query.
            results: List of search result dicts.

        Returns:
            Formatted string of search results.
        """
        lines = [f"Search results for: {query}\n"]
        for i, result in enumerate(results[:5], 1):
            title = result.get("title", result.get("name", f"Result {i}"))
            snippet = result.get("snippet", result.get("description", result.get("text", "")))
            url = result.get("url", result.get("link", ""))
            lines.append(f"{i}. {title}")
            if snippet:
                lines.append(f"   {snippet[:500]}")
            if url:
                lines.append(f"   URL: {url}")
            lines.append("")
        return "\n".join(lines)

    @staticmethod
    def _is_translatable(file_entry: FileEntry) -> bool:
        """Determine if a file is a code file that should be translated.

        Args:
            file_entry: The file entry to check.

        Returns:
            True if the file should be translated.
        """
        # Skip non-code files
        non_code_extensions = {
            ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff",
            ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".wav", ".avi",
            ".mov", ".zip", ".tar", ".gz", ".rar", ".7z", ".pdf",
            ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
        }
        _, ext = os.path.splitext(file_entry.name.lower())
        return ext not in non_code_extensions

    @staticmethod
    def _read_source_file(upload_dir: str, rel_path: str) -> str:
        """Read a source file from disk.

        Args:
            upload_dir: Root directory of the source project.
            rel_path: Relative path to the file.

        Returns:
            The file content, or empty string on failure.
        """
        full_path = os.path.join(upload_dir, rel_path)
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read()
        except Exception as exc:
            logger.error("Failed to read source file %s: %s", rel_path, exc)
            return ""

    # Universal mapping: language name → primary file extension
    LANG_PRIMARY_EXT: dict[str, str] = {
        "Python": ".py",
        "JavaScript": ".js",
        "TypeScript": ".ts",
        "Java": ".java",
        "Go": ".go",
        "Rust": ".rs",
        "Ruby": ".rb",
        "PHP": ".php",
        "C#": ".cs",
        "C++": ".cpp",
        "C": ".c",
        "Swift": ".swift",
        "Kotlin": ".kt",
        "Scala": ".scala",
        "Dart": ".dart",
        "Shell": ".sh",
        "SQL": ".sql",
        "HTML": ".html",
        "CSS": ".css",
        "HTML/CSS": ".html",
        "SCSS": ".scss",
        "R": ".r",
        "Objective-C": ".m",
        "Electron": ".js",
        "JSON": ".json",
        "YAML": ".yaml",
        "TOML": ".toml",
        "XML": ".xml",
        "Markdown": ".md",
    }

    # Universal mapping: language name → all extensions belonging to that language
    LANG_ALL_EXTS: dict[str, set[str]] = {
        "Python": {".py", ".pyw", ".pyi"},
        "JavaScript": {".js", ".jsx", ".mjs", ".cjs"},
        "TypeScript": {".ts", ".tsx", ".mts", ".cts"},
        "Java": {".java"},
        "Go": {".go"},
        "Rust": {".rs"},
        "Ruby": {".rb", ".erb"},
        "PHP": {".php", ".phtml"},
        "C#": {".cs"},
        "C++": {".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".hh"},
        "C": {".c", ".h"},
        "Swift": {".swift"},
        "Kotlin": {".kt", ".kts"},
        "Scala": {".scala"},
        "Dart": {".dart"},
        "Shell": {".sh", ".bash", ".zsh"},
        "SQL": {".sql"},
        "HTML": {".html", ".htm"},
        "CSS": {".css"},
        "HTML/CSS": {".html", ".htm", ".css", ".scss"},
        "SCSS": {".scss", ".sass"},
        "R": {".r", ".R"},
        "Objective-C": {".m", ".mm"},
        "Electron": {".js", ".jsx", ".html", ".css"},
        "JSON": {".json"},
        "YAML": {".yaml", ".yml"},
        "TOML": {".toml"},
        "XML": {".xml"},
        "Markdown": {".md", ".mdx"},
    }

    # Special cross-language extension rules:
    # (source_ext, target_lang) → target_ext
    # These handle cases where a simple primary-ext swap isn't correct
    SPECIAL_EXT_RULES: dict[tuple[str, str], str] = {
        # JSX/TSX cross-mapping between JS and TS
        (".jsx", "TypeScript"): ".tsx",
        (".tsx", "JavaScript"): ".jsx",
        (".jsx", "Python"): ".py",
        (".tsx", "Python"): ".py",
        # C/C++ header special cases
        (".h", "C++"): ".hpp",
        (".hpp", "C"): ".h",
        # CSS variants
        (".scss", "HTML/CSS"): ".scss",
        (".css", "HTML/CSS"): ".css",
        # HTML/CSS source files should keep their identity when translating
        (".html", "HTML/CSS"): ".html",
        (".css", "HTML/CSS"): ".css",
        (".scss", "HTML/CSS"): ".scss",
        # When translating TO HTML/CSS, map code files to .html
        (".py", "HTML/CSS"): ".html",
        (".js", "HTML/CSS"): ".html",
        (".ts", "HTML/CSS"): ".html",
        (".java", "HTML/CSS"): ".html",
        (".go", "HTML/CSS"): ".html",
        (".rs", "HTML/CSS"): ".html",
        (".rb", "HTML/CSS"): ".html",
        (".php", "HTML/CSS"): ".html",
        (".cs", "HTML/CSS"): ".html",
        (".cpp", "HTML/CSS"): ".html",
        (".c", "HTML/CSS"): ".html",
        (".swift", "HTML/CSS"): ".html",
        (".kt", "HTML/CSS"): ".html",
        (".scala", "HTML/CSS"): ".html",
        (".dart", "HTML/CSS"): ".html",
        (".sh", "HTML/CSS"): ".html",
    }

    @staticmethod
    def _get_translated_path(source_path: str, source_lang: str, target_lang: str) -> str:
        """Determine the output path for a translated file.

        Uses a universal language-to-extension mapping so that ALL language
        pairs are handled, not just a handful of hardcoded combinations.

        Args:
            source_path: The original file path.
            source_lang: Source programming language.
            target_lang: Target programming language.

        Returns:
            The translated file path with appropriate extension.
        """
        _, ext = os.path.splitext(source_path)
        ext = ext.lower()
        base = os.path.splitext(source_path)[0]

        # 1. Check special cross-language rules first
        special_key = (ext, target_lang)
        if special_key in TranslationService.SPECIAL_EXT_RULES:
            new_ext = TranslationService.SPECIAL_EXT_RULES[special_key]
            # Java PascalCase naming convention
            if target_lang == "Java" and source_lang in ("Python", "Ruby", "Go", "C"):
                basename = os.path.basename(base)
                if basename and basename[0].islower():
                    pascal = basename[0].upper() + basename[1:]
                    base = os.path.join(os.path.dirname(base), pascal)
            return base + new_ext

        # 2. Check if source extension belongs to source language
        source_exts = TranslationService.LANG_ALL_EXTS.get(source_lang, set())
        if ext in source_exts:
            # Replace with target language's primary extension
            target_ext = TranslationService.LANG_PRIMARY_EXT.get(target_lang)
            if target_ext:
                # Java PascalCase naming convention
                if target_lang == "Java" and source_lang in ("Python", "Ruby", "Go", "C"):
                    basename = os.path.basename(base)
                    if basename and basename[0].islower():
                        pascal = basename[0].upper() + basename[1:]
                        base = os.path.join(os.path.dirname(base), pascal)
                # Python snake_case naming convention (from PascalCase/camelCase)
                if target_lang == "Python" and source_lang in ("Java", "C#", "Go", "Kotlin", "Swift", "Scala", "Rust", "C++", "C", "Dart", "Objective-C"):
                    basename = os.path.basename(base)
                    if basename and basename[0].isupper():
                        snake = TranslationService._to_snake_case(basename)
                        base = os.path.join(os.path.dirname(base), snake)
                return base + target_ext

        # 3. If the extension doesn't belong to the source language but we
        #    have a primary extension for the target, still replace it.
        #    This handles cases like config files (.json, .yaml, etc.) or
        #    unrecognized source extensions.
        target_ext = TranslationService.LANG_PRIMARY_EXT.get(target_lang)
        if target_ext and ext != target_ext:
            # Only replace if the source extension is a known code extension
            known_code_exts = {
                ".py", ".pyw", ".pyi", ".js", ".jsx", ".mjs", ".cjs",
                ".ts", ".tsx", ".mts", ".cts", ".java", ".go", ".rs",
                ".rb", ".erb", ".php", ".phtml", ".cs", ".cpp", ".cxx",
                ".cc", ".hpp", ".hxx", ".hh", ".c", ".h", ".swift",
                ".kt", ".kts", ".scala", ".dart", ".sh", ".bash", ".zsh",
                ".sql", ".html", ".htm", ".css", ".scss", ".sass",
                ".r", ".m", ".mm",
            }
            if ext in known_code_exts:
                # Java PascalCase naming convention
                if target_lang == "Java":
                    basename = os.path.basename(base)
                    if basename and basename[0].islower():
                        pascal = basename[0].upper() + basename[1:]
                        base = os.path.join(os.path.dirname(base), pascal)
                return base + target_ext

        # 4. Fallback: keep the original path (for non-code files, config, etc.)
        return source_path

    @staticmethod
    def _to_snake_case(name: str) -> str:
        """Convert PascalCase or camelCase to snake_case.

        Args:
            name: The name to convert.

        Returns:
            The snake_case version of the name.
        """
        import re
        # Insert underscore before uppercase letters and lowercase them
        s1 = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)
        result = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s1).lower()
        return result

    @staticmethod
    def _strip_code_fences(text: str) -> str:
        """Strip markdown code fences from LLM output.

        Args:
            text: Text that may be wrapped in code fences.

        Returns:
            The text without code fences.
        """
        lines = text.strip().split("\n")

        # Remove opening fence
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]

        # Remove closing fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        return "\n".join(lines)
