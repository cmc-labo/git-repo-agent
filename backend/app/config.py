import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # --- DB (Turso / libSQL). 未設定ならローカル SQLite ---
    turso_url: str = field(default_factory=lambda: os.getenv("TURSO_DATABASE_URL", ""))
    turso_token: str = field(default_factory=lambda: os.getenv("TURSO_AUTH_TOKEN", ""))
    sqlite_path: str = field(default_factory=lambda: os.getenv("SQLITE_PATH", "./local.db"))

    # --- Gemini ---
    # Vertex AI 経由: GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT (+ GOOGLE_CLOUD_LOCATION)
    # Gemini API 直:  GEMINI_API_KEY
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    use_vertex: bool = field(default_factory=lambda: _bool("GOOGLE_GENAI_USE_VERTEXAI"))
    gcp_project: str = field(default_factory=lambda: os.getenv("GOOGLE_CLOUD_PROJECT", ""))
    gcp_location: str = field(default_factory=lambda: os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
    # 認証情報がない場合は固定のサンプル出力で動く (UI 確認・デモ用)
    demo_mode: bool = field(default_factory=lambda: _bool("DEMO_MODE"))

    # --- GitHub ---
    github_token: str = field(default_factory=lambda: os.getenv("GITHUB_TOKEN", ""))  # public リポジトリ用 (rate limit 緩和)

    # --- App ---
    app_secret: str = field(default_factory=lambda: os.getenv("APP_SECRET", "dev-secret-change-me"))
    cron_token: str = field(default_factory=lambda: os.getenv("CRON_TOKEN", ""))
    public_base_url: str = field(default_factory=lambda: os.getenv("PUBLIC_BASE_URL", "http://localhost:8000"))
    cors_origins: str = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "*"))
    competitor_refresh_days: int = field(default_factory=lambda: int(os.getenv("COMPETITOR_REFRESH_DAYS", "7")))
    # 同時開発者数 (ロードマップのスケジューリングに使う並列レーン数)
    roadmap_lanes: int = field(default_factory=lambda: int(os.getenv("ROADMAP_LANES", "2")))
    # Cloudflare Turnstile. 設定するとリポジトリ登録時にボット判定を必須にする (未設定なら検証しない)
    turnstile_secret: str = field(default_factory=lambda: os.getenv("TURNSTILE_SECRET_KEY", ""))
    # 初回起動時に一度だけ登録するデモ用リポジトリ (空にすると登録しない)
    demo_repo: str = field(default_factory=lambda: os.getenv("DEMO_REPO", "antirez/kilo"))
    demo_repo_language: str = field(default_factory=lambda: os.getenv("DEMO_REPO_LANGUAGE", "en"))

    @property
    def gemini_available(self) -> bool:
        if self.demo_mode:
            return False
        return bool(self.gemini_api_key) or (self.use_vertex and bool(self.gcp_project))


settings = Settings()
