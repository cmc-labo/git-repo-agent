"""Gemini 呼び出しラッパー (google-genai SDK. Vertex AI / Gemini API 両対応)."""
from __future__ import annotations

import logging
import time
from typing import TypeVar

from pydantic import BaseModel

from ..config import settings

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

_client = None


def client():
    global _client
    if _client is None:
        from google import genai

        if settings.use_vertex:
            _client = genai.Client(vertexai=True, project=settings.gcp_project, location=settings.gcp_location)
        else:
            _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _retry(fn, attempts: int = 3):
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001  429/503 等は少し待って再試行
            if i == attempts - 1:
                raise
            log.warning("Gemini call failed (%s), retrying", e)
            time.sleep(2 * (i + 1))


def generate_json(system: str, prompt: str, schema: type[T], temperature: float = 0.3) -> T:
    from google.genai import types

    def call():
        resp = client().models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
        if resp.parsed is not None:
            return resp.parsed
        return schema.model_validate_json(resp.text)

    return _retry(call)


def grounded_search(prompt: str) -> tuple[str, list[dict]]:
    """Google Search Grounding 付きで生成し、本文と参照元 URL を返す."""
    from google.genai import types

    def call():
        resp = client().models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.2,
            ),
        )
        sources: list[dict] = []
        seen = set()
        for cand in resp.candidates or []:
            gm = getattr(cand, "grounding_metadata", None)
            for ch in (getattr(gm, "grounding_chunks", None) or []):
                web = getattr(ch, "web", None)
                if web and web.uri and web.uri not in seen:
                    seen.add(web.uri)
                    sources.append({"title": web.title or web.uri, "url": web.uri})
        return resp.text or "", sources

    return _retry(call)
