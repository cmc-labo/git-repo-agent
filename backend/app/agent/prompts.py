import json

SYSTEM = (
    "あなたは Git Repository Agent です。GitHub リポジトリを継続的に観測し、開発状況を理解し、"
    "競合サービスを分析した上で、開発チームが次に何をすべきかを提案するシニアなテックリード兼プロダクトマネージャーです。"
    "出力は必ず日本語で、根拠のある具体的な内容にしてください。推測の場合はそう明記してください。"
)


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, indent=1)


def insight_prompt(ctx: dict) -> str:
    return f"""以下の GitHub リポジトリのスナップショットを読み、プロダクトと開発状況を把握してください。

# リポジトリ
{ctx['full_name']} (private={ctx['is_private']}, stars={ctx['stars']})
説明: {ctx['description']}
topics: {', '.join(ctx['topics'])}
homepage: {ctx['homepage']}
言語構成(bytes): {_j(ctx['languages'])}

# README
{ctx['readme'][:8000] or '(なし)'}

# ファイル構成 (一部)
{chr(10).join(ctx['tree'][:250]) or '(空)'}

# 主要ファイル
{_j({k: v[:2000] for k, v in ctx['key_files'].items()})}

# 最近のコミット
{_j(ctx['recent_commits'][:30])}

# オープンな Issue/PR
{_j(ctx['open_issues'][:20])}
"""


def competitor_search_prompt(insight: dict, ctx: dict) -> str:
    return f"""次のプロダクトの競合・類似サービスを Google 検索で調査してください。
OSS リポジトリ、Web サービス、モバイルアプリ、ライブラリなど種類を問いません。
各競合について、名前・URL・特徴・強み・弱み・主要機能を調べ、市場動向と技術トレンドもまとめてください。

プロダクト: {ctx['full_name']}
概要: {insight['summary']}
カテゴリ: {insight['product_category']}
ターゲット: {insight['target_users']}
技術スタック: {', '.join(insight['tech_stack'])}
検索キーワード: {', '.join(insight['search_keywords'])}
"""


def competitor_structure_prompt(insight: dict, research: str, gh_repos: list[dict], sources: list[dict]) -> str:
    return f"""Web 調査結果と GitHub の類似リポジトリ検索結果をもとに、競合分析を構造化してください。
競合は重要度順に 4〜8 件。URL は調査結果に出てきたものだけを使い、捏造しないこと。
feature_gap は「自プロダクトの実装済み機能」と比較して、競合にあって自分にない機能を書いてください。

# 自プロダクト
概要: {insight['summary']}
実装済み機能: {_j(insight['implemented_features'])}

# Web 調査結果 (Google Search Grounding)
{research[:12000]}

# 参照元
{_j(sources[:20])}

# GitHub 類似リポジトリ (stars 順)
{_j(gh_repos)}
"""


def plan_prompt(ctx: dict, insight: dict, competitors: dict | None, milestones: list[dict],
                tasks: list[dict], is_initial: bool) -> str:
    diff = ctx.get("diff")
    if is_initial:
        mode = """# モード: 初回分析
既存タスクはありません。milestones を 3〜5 個 (key は 'new-1' 形式) 作り、new_tasks を 10〜18 個提案してください。
すでに実装済みの機能をタスクにしないこと。task_updates は空配列にしてください。"""
    else:
        mode = f"""# モード: 差分再分析
前回分析以降の変更 (diff) と既存タスクを照合し、以下を行ってください:
1. 変更内容から完了/着手したと判断できるタスクは task_updates で status を done / in_progress にする (reason に根拠のコミットやPRを書く)
2. 状況変化で不要になったタスクは dropped、優先度が変わったものは urgency/importance を更新
3. 新たに必要になったタスク (新しいバグの可能性, テスト不足, 競合の動き等) を new_tasks に 0〜6 個追加
4. milestones は既存のものを key=既存ID で全て返し、必要なら 'new-' キーで追加
変更のないタスクは task_updates に含めないでください。

# 既存マイルストーン
{_j(milestones)}

# 既存タスク
{_j(tasks)}

# 前回分析からの差分
{_j(diff) if diff else '(差分情報なし: 最新コミットと Issue から判断)'}"""

    comp = ""
    if competitors:
        comp = f"""# 競合分析
{_j({'differentiation': competitors.get('differentiation'), 'tech_trends': competitors.get('tech_trends'),
     'competitors': [{'name': c['name'], 'feature_gap': c['feature_gap'], 'threat_level': c['threat_level']}
                     for c in competitors.get('competitors', [])]})}"""

    return f"""あなたはこのリポジトリの開発計画を管理しています。
緊急度(urgency)と重要度(importance)は 1〜5 で、以下を基準にしてください:
- 重要度: プロダクト価値・競合との差別化・ユーザー影響・リスク低減への寄与
- 緊急度: 放置した場合の損失の速さ、他タスクのブロッカーか、競合に追いつかれるリスク
effort_days は 1 人で実施する場合の人日 (0.5〜10)。

{mode}

# リポジトリ理解
{_j(insight)}

{comp}

# 最近のコミット
{_j(ctx['recent_commits'][:20])}

# オープンな Issue/PR
{_j(ctx['open_issues'][:20])}

# 最近クローズされた Issue/PR
{_j(ctx['recently_closed'][:15])}
"""
