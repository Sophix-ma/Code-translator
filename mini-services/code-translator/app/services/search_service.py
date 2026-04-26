"""Web search service using the z-ai CLI."""

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class SearchService:
    """Service for performing web searches via the z-ai CLI tool."""

    async def search(self, query: str, num: int = 5) -> list[dict[str, Any]]:
        """Perform a web search using the z-ai CLI.

        Args:
            query: The search query string.
            num: Number of results to return.

        Returns:
            A list of search result dictionaries.
        """
        try:
            args = json.dumps({"query": query, "num": num})
            cmd = ["z-ai", "function", "-n", "web_search", "-a", args]

            logger.info("Running web search: %s", query)
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode().strip() if stderr else "Unknown error"
                logger.error("Search command failed (rc=%d): %s", process.returncode, error_msg)
                return []

            raw_output = stdout.decode().strip()
            if not raw_output:
                logger.warning("Empty search output for query: %s", query)
                return []

            results = self._parse_results(raw_output)
            logger.info("Search returned %d results for: %s", len(results), query)
            return results

        except FileNotFoundError:
            logger.error("z-ai CLI not found. Ensure it is installed and on PATH.")
            return []
        except Exception as exc:
            logger.error("Search error for query '%s': %s", query, exc)
            return []

    def _parse_results(self, raw_output: str) -> list[dict[str, Any]]:
        """Parse the raw JSON output from z-ai into a list of result dicts.

        Args:
            raw_output: The raw stdout from the z-ai CLI.

        Returns:
            A list of search result dictionaries.
        """
        try:
            parsed = json.loads(raw_output)

            # Handle various response formats from z-ai
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                # Common patterns: {"results": [...]}, {"data": [...]}, or the dict itself
                for key in ("results", "data", "items", "search_results"):
                    if key in parsed and isinstance(parsed[key], list):
                        return parsed[key]
                # If no known key found, wrap the dict in a list
                return [parsed]

            logger.warning("Unexpected search output format: %s", type(parsed).__name__)
            return []

        except json.JSONDecodeError as exc:
            logger.error("Failed to parse search results as JSON: %s", exc)
            # Try to return partial results if possible
            return []
