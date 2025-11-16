"""
Minimal local stub for emergentintegrations.llm.chat
Use for local development only. Replace with the real integration later.
"""

from dataclasses import dataclass
import asyncio
from typing import List, Any, Dict

@dataclass
class UserMessage:
    content: str
    role: str = "user"
    metadata: Dict[str, Any] = None

class LlmChat:
    """
    Very small LlmChat stub that exposes:
      - async send_async(messages) -> dict
      - send(messages) -> dict (sync wrapper)
    The stub returns a trivial assistant reply so server endpoints work.
    """

    def __init__(self, *args, **kwargs):
        self.config = kwargs

    async def send_async(self, messages: List[Any]) -> Dict[str, str]:
        # combine messages into a simple echo reply
        parts = []
        for m in messages:
            if hasattr(m, "content"):
                parts.append(m.content)
            elif isinstance(m, dict) and "content" in m:
                parts.append(m["content"])
            else:
                parts.append(str(m))
        joined = " ".join(parts).strip()
        # tiny async pause so coroutine behavior remains realistic
        await asyncio.sleep(0)
        return {"role": "assistant", "content": f"[stub] got: {joined}"}

    def send(self, messages: List[Any]) -> Dict[str, str]:
        loop = asyncio.get_event_loop()
        try:
            return loop.run_until_complete(self.send_async(messages))
        except RuntimeError:
            # fallback for nested event loops (e.g., inside uvicorn)
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(self.send_async(messages))
