"""GitHub REST API からエージェントに渡すコンテキストを収集する."""
from __future__ import annotations

import base64
import re
from typing import Any

import httpx

API = "https://api.github.com"

# リポジトリの性質を掴むために優先的に読むファイル
KEY_FILES = [
    "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
    "pom.xml", "build.gradle", "Gemfile", "composer.json", "Dockerfile",
    "docker-compose.yml", "ROADMAP.md", "TODO.md", "CONTRIBUTING.md",
]


class GitHubError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def parse_repo_ref(ref: str) -> tuple[str, str]:
    """'owner/repo' または GitHub URL から (owner, repo) を得る."""
    ref = ref.strip()
    m = re.search(r"github\.com[/:]([^/\s]+)/([^/\s#?]+)", ref)
    if m:
        owner, name = m.group(1), m.group(2)
    else:
        parts = ref.strip("/").split("/")
        if len(parts) != 2 or not all(parts):
            raise ValueError("リポジトリは 'owner/repo' または GitHub の URL で指定してください")
        owner, name = parts
    if name.endswith(".git"):
        name = name[:-4]
    return owner, name


class GitHubClient:
    def __init__(self, token: str | None = None):
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._c = httpx.Client(base_url=API, headers=headers, timeout=30)

    def _get(self, path: str, **params) -> Any:
        r = self._c.get(path, params=params or None)
        if r.status_code >= 400:
            msg = r.json().get("message", r.text) if r.headers.get("content-type", "").startswith("application/json") else r.text
            raise GitHubError(r.status_code, f"GitHub API {path}: {r.status_code} {msg}")
        return r.json()

    def _get_opt(self, path: str, **params) -> Any:
        try:
            return self._get(path, **params)
        except GitHubError as e:
            if e.status in (404, 409, 422):  # 409: 空リポジトリ
                return None
            raise

    # ---- basic ----
    def repo(self, owner: str, name: str) -> dict:
        return self._get(f"/repos/{owner}/{name}")

    def head_sha(self, owner: str, name: str, branch: str) -> str | None:
        b = self._get_opt(f"/repos/{owner}/{name}/branches/{branch}")
        return b["commit"]["sha"] if b else None

    def readme(self, owner: str, name: str, limit: int = 12000) -> str:
        d = self._get_opt(f"/repos/{owner}/{name}/readme")
        if not d or "content" not in d:
            return ""
        return base64.b64decode(d["content"]).decode("utf-8", "replace")[:limit]

    def file_text(self, owner: str, name: str, path: str, ref: str | None = None, limit: int = 4000) -> str | None:
        params = {"ref": ref} if ref else {}
        d = self._get_opt(f"/repos/{owner}/{name}/contents/{path}", **params)
        if not d or not isinstance(d, dict) or d.get("encoding") != "base64":
            return None
        return base64.b64decode(d["content"]).decode("utf-8", "replace")[:limit]

    def tree(self, owner: str, name: str, sha: str, limit: int = 400) -> list[str]:
        d = self._get_opt(f"/repos/{owner}/{name}/git/trees/{sha}", recursive="1")
        if not d:
            return []
        skip = re.compile(r"(^|/)(node_modules|\.git|dist|build|vendor|__pycache__|\.next|venv|\.venv)/")
        paths = [t["path"] for t in d.get("tree", []) if t.get("type") == "blob" and not skip.search(t["path"])]
        return paths[:limit]

    def languages(self, owner: str, name: str) -> dict:
        return self._get_opt(f"/repos/{owner}/{name}/languages") or {}

    def commits(self, owner: str, name: str, n: int = 30) -> list[dict]:
        d = self._get_opt(f"/repos/{owner}/{name}/commits", per_page=n) or []
        return [_commit(c) for c in d]

    def issues(self, owner: str, name: str, state: str = "open", n: int = 30) -> list[dict]:
        d = self._get_opt(f"/repos/{owner}/{name}/issues", state=state, per_page=n, sort="updated") or []
        return [
            {
                "number": i["number"],
                "title": i["title"],
                "state": i["state"],
                "is_pr": "pull_request" in i,
                "labels": [l["name"] for l in i.get("labels", [])],
                "body": (i.get("body") or "")[:400],
                "updated_at": i.get("updated_at"),
            }
            for i in d
        ]

    def compare(self, owner: str, name: str, base: str, head: str) -> dict | None:
        d = self._get_opt(f"/repos/{owner}/{name}/compare/{base}...{head}")
        if not d:
            return None
        files = [
            {
                "filename": f["filename"],
                "status": f["status"],
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0),
                "patch": (f.get("patch") or "")[:1500],
            }
            for f in d.get("files", [])[:40]
        ]
        return {
            "total_commits": d.get("total_commits", 0),
            "commits": [_commit(c) for c in d.get("commits", [])[-50:]],
            "files": files,
        }

    def search_repos(self, q: str, n: int = 8) -> list[dict]:
        d = self._get_opt("/search/repositories", q=q, sort="stars", order="desc", per_page=n)
        if not d:
            return []
        return [
            {
                "full_name": r["full_name"],
                "html_url": r["html_url"],
                "description": r.get("description") or "",
                "stars": r.get("stargazers_count", 0),
                "language": r.get("language"),
                "topics": r.get("topics", [])[:8],
                "pushed_at": r.get("pushed_at"),
            }
            for r in d.get("items", [])
        ]


def _commit(c: dict) -> dict:
    return {
        "sha": c["sha"][:7],
        "message": c["commit"]["message"].split("\n")[0][:200],
        "author": (c["commit"].get("author") or {}).get("name"),
        "date": (c["commit"].get("author") or {}).get("date"),
    }


def collect_context(gh: GitHubClient, owner: str, name: str, meta: dict, head_sha: str | None,
                    base_sha: str | None) -> dict:
    """エージェントに渡すリポジトリスナップショット."""
    ctx: dict[str, Any] = {
        "full_name": meta["full_name"],
        "description": meta.get("description") or "",
        "topics": meta.get("topics", []),
        "homepage": meta.get("homepage") or "",
        "stars": meta.get("stargazers_count", 0),
        "is_private": meta.get("private", False),
        "languages": gh.languages(owner, name),
        "readme": gh.readme(owner, name),
        "tree": gh.tree(owner, name, head_sha) if head_sha else [],
        "recent_commits": gh.commits(owner, name, 30) if head_sha else [],
        "open_issues": gh.issues(owner, name, "open", 30),
        "recently_closed": gh.issues(owner, name, "closed", 15),
        "key_files": {},
        "diff": None,
    }
    tree_set = set(ctx["tree"])
    for f in KEY_FILES:
        if f in tree_set:
            txt = gh.file_text(owner, name, f, head_sha)
            if txt:
                ctx["key_files"][f] = txt
    if base_sha and head_sha and base_sha != head_sha:
        ctx["diff"] = gh.compare(owner, name, base_sha, head_sha)
    return ctx
