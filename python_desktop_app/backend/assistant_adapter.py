from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .commands import run_local_command


@dataclass(frozen=True)
class AssistantResult:
    input: str
    intent: str
    summary: str
    actions: list[dict]
    answers: list[dict]
    needs_input: bool = False


class CommandAssistant(Protocol):
    def run(self, command: str, selected_asset_id: str | None = None) -> AssistantResult:
        """Run a dashboard command and return a normalized result."""


class RuleBasedAssistant:
    """Local deterministic assistant used by the desktop MVP."""

    def run(self, command: str, selected_asset_id: str | None = None) -> AssistantResult:
        payload = run_local_command(command, selected_asset_id)
        return AssistantResult(
            input=payload["input"],
            intent=payload["intent"],
            summary=payload["summary"],
            actions=payload["actions"],
            answers=payload["answers"],
            needs_input=payload["needs_input"],
        )


class OpenAIAssistantPlaceholder:
    """
    Future OpenAI adapter boundary.

    Keep API keys in .env as OPENAI_API_KEY or another approved secret source.
    This class intentionally does not import an OpenAI SDK or read credentials.
    """

    def run(self, command: str, selected_asset_id: str | None = None) -> AssistantResult:
        raise NotImplementedError("OpenAI assistant integration is intentionally not enabled in the desktop MVP.")

