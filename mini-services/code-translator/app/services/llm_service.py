"""LLM service using OpenAI-compatible API with streaming support."""

import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class LLMService:
    """Service for interacting with OpenAI-compatible LLM APIs."""

    def __init__(self, base_url: str, api_key: str, model_name: str):
        self.client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        self.model = model_name
        logger.info("LLMService initialized with model=%s, base_url=%s", model_name, base_url)

    async def chat(self, messages: list[dict], temperature: float = 0.2) -> str:
        """Make a non-streaming chat completion call.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            temperature: Sampling temperature.

        Returns:
            The assistant's response content as a string.
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
            )
            content = response.choices[0].message.content or ""
            logger.debug("LLM response length: %d chars", len(content))
            return content
        except Exception as exc:
            logger.error("LLM chat error: %s", exc)
            raise

    async def chat_stream(self, messages: list[dict], temperature: float = 0.2) -> AsyncIterator[str]:
        """Stream chat completion tokens.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            temperature: Sampling temperature.

        Yields:
            Individual content tokens as they arrive.
        """
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except Exception as exc:
            logger.error("LLM stream error: %s", exc)
            raise

    async def chat_with_system(self, system_prompt: str, user_message: str, temperature: float = 0.2) -> str:
        """Convenience method for a single-turn chat with a system prompt.

        Args:
            system_prompt: The system instruction.
            user_message: The user's message.
            temperature: Sampling temperature.

        Returns:
            The assistant's response content.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        return await self.chat(messages, temperature=temperature)

    async def chat_json(self, messages: list[dict], temperature: float = 0.1) -> str:
        """Chat completion expecting a JSON response.

        Uses lower temperature for more deterministic output.

        Args:
            messages: List of message dicts.
            temperature: Sampling temperature (default 0.1 for JSON).

        Returns:
            The assistant's response content (expected to be valid JSON).
        """
        return await self.chat(messages, temperature=temperature)
