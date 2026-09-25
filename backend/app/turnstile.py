"""Cloudflare Turnstile のトークン検証 (リポジトリ登録をプログラムから実行させないため)."""
from __future__ import annotations

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)
SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify(token: str | None) -> bool:
    if not settings.turnstile_secret:
        return True  # 未設定 (ローカル開発など) は検証しない
    if not token or len(token) > 2048:
        return False
    try:
        r = httpx.post(SITEVERIFY_URL, data={"secret": settings.turnstile_secret, "response": token}, timeout=10)
        result = r.json()
    except Exception:  # noqa: BLE001  Cloudflare に届かない場合は安全側 (拒否) に倒す
        log.warning("turnstile siteverify failed", exc_info=True)
        return False
    if not result.get("success"):
        log.info("turnstile rejected: %s", result.get("error-codes"))
    return bool(result.get("success"))
