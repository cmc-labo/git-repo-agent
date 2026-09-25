import json


def system(lang: str) -> str:
    """lang は BCP-47 コード (例: ja, en, pt-BR). 自然文の出力言語を指定する."""
    return (
        "You are Git Repository Agent: a senior tech lead and product manager who continuously watches a GitHub "
        "repository, understands its development status, analyzes competing services, and tells the team what to "
        "do next. Be concrete and evidence-based; say so explicitly when something is a guess.\n"
        f"LANGUAGE: Write every natural-language value (summaries, titles, descriptions, reasons, lists) in the "
        f"language identified by the BCP-47 code '{lang}'. Keep product names, code identifiers, URLs, and JSON "
        "keys/enum values unchanged."
    )


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, indent=1)


def insight_prompt(ctx: dict) -> str:
    return f"""Read this snapshot of a GitHub repository and understand the product and its development status.

# Repository
{ctx['full_name']} (private={ctx['is_private']}, stars={ctx['stars']})
Description: {ctx['description']}
Topics: {', '.join(ctx['topics'])}
Homepage: {ctx['homepage']}
Languages (bytes): {_j(ctx['languages'])}

# README
{ctx['readme'][:8000] or '(none)'}

# File tree (partial)
{chr(10).join(ctx['tree'][:250]) or '(empty)'}

# Key files
{_j({k: v[:2000] for k, v in ctx['key_files'].items()})}

# Recent commits
{_j(ctx['recent_commits'][:30])}

# Open issues / PRs
{_j(ctx['open_issues'][:20])}
"""


def competitor_search_prompt(insight: dict, ctx: dict) -> str:
    return f"""Use Google Search to research competitors and similar services for the product below.
Any kind counts: OSS repositories, web services, mobile apps, libraries.
For each competitor find its name, URL, characteristics, strengths, weaknesses and key features.
Also summarize the market and the relevant technology trends.

Product: {ctx['full_name']}
Summary: {insight['summary']}
Category: {insight['product_category']}
Target users: {insight['target_users']}
Tech stack: {', '.join(insight['tech_stack'])}
Search keywords: {', '.join(insight['search_keywords'])}
"""


def competitor_structure_prompt(insight: dict, research: str, gh_repos: list[dict], sources: list[dict]) -> str:
    return f"""Structure a competitor analysis from the web research and the GitHub similar-repository search below.
List 4-8 competitors, most important first. Only use URLs that appear in the research; never invent URLs.
feature_gap: features the competitor has that this product lacks, compared with its implemented features.

# This product
Summary: {insight['summary']}
Implemented features: {_j(insight['implemented_features'])}

# Web research (Google Search Grounding)
{research[:12000]}

# Sources
{_j(sources[:20])}

# Similar GitHub repositories (by stars)
{_j(gh_repos)}
"""


def plan_prompt(ctx: dict, insight: dict, competitors: dict | None, milestones: list[dict],
                tasks: list[dict], is_initial: bool) -> str:
    diff = ctx.get("diff")
    if is_initial:
        mode = """# Mode: initial analysis
There are no existing tasks. Create 3-5 milestones (key format 'new-1') and propose 10-18 new_tasks.
Do not create tasks for features that are already implemented. task_updates must be an empty array."""
    else:
        mode = f"""# Mode: incremental re-analysis
Compare the changes since the previous analysis (diff) with the existing tasks, then:
1. Tasks the changes show as finished/started -> task_updates with status done / in_progress (put the evidencing commit or PR in reason)
2. Tasks made unnecessary -> dropped; tasks whose priority changed -> update urgency/importance
3. Add 0-6 new_tasks that are now needed (possible new bugs, missing tests, competitor moves, ...)
4. Return ALL existing milestones in milestones with key = existing id; add new ones with a 'new-' key if needed
Do not include unchanged tasks in task_updates.

# Existing milestones
{_j(milestones)}

# Existing tasks
{_j(tasks)}

# Diff since the previous analysis
{_j(diff) if diff else '(no diff available: judge from the latest commits and issues)'}"""

    comp = ""
    if competitors:
        comp = f"""# Competitor analysis
{_j({'differentiation': competitors.get('differentiation'), 'tech_trends': competitors.get('tech_trends'),
     'competitors': [{'name': c['name'], 'feature_gap': c['feature_gap'], 'threat_level': c['threat_level']}
                     for c in competitors.get('competitors', [])]})}"""

    return f"""You manage the development plan of this repository.
Rate urgency and importance from 1 to 5:
- importance: contribution to product value, differentiation from competitors, user impact, risk reduction
- urgency: how fast loss accrues if ignored, whether it blocks other tasks, risk of competitors pulling ahead
effort_days is person-days for one developer (0.5-10).

{mode}

# Repository understanding
{_j(insight)}

{comp}

# Recent commits
{_j(ctx['recent_commits'][:20])}

# Open issues / PRs
{_j(ctx['open_issues'][:20])}

# Recently closed issues / PRs
{_j(ctx['recently_closed'][:15])}
"""


def translate_prompt(lang: str, entries: dict[str, str]) -> str:
    return f"""Translate the user-interface strings below from English into the language with BCP-47 code '{lang}'.
Rules:
- This is the UI of a developer tool that analyzes GitHub repositories. Use natural, concise UI wording.
- Keep placeholders such as {{n}} or {{date}} exactly as-is, and keep symbols/emoji (①, ↗, 🤖, →, ·).
- Keep product/technical names unchanged: GitHub, Gemini, Google Search, Webhook, Cloud Run, PR, WBS, Secret, URL.
- Return every key exactly once with its translated text.

{_j([{"key": k, "text": v} for k, v in entries.items()])}
"""
