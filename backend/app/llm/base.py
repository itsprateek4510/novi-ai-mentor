from abc import ABC, abstractmethod
from typing import Any


class LLMError(Exception):
    """Raised when the LLM provider fails to produce a usable result."""


class LLMProvider(ABC):
    """Contract for any LLM backend Novi talks through."""

    @abstractmethod
    async def complete(self, prompt: str, system: str | None = None) -> str:
        ...

    @abstractmethod
    async def complete_json(self, prompt: str, system: str | None = None) -> Any:
        ...