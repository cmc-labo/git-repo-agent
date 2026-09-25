import { STATUS_LABEL } from "@/lib/api";

const REPO_STATUS: Record<string, string> = { idle: "最新", queued: "待機中", analyzing: "分析中", error: "エラー" };

export function TaskStatus({ status }: { status: string }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function RepoStatus({ status }: { status: string }) {
  const busy = status === "queued" || status === "analyzing";
  return (
    <span className={`status ${status}`}>
      {busy && "⟳ "}
      {REPO_STATUS[status] ?? status}
    </span>
  );
}

export function Score({ value }: { value: number }) {
  const cls = value >= 75 ? "s-high" : value >= 55 ? "s-mid" : "s-low";
  return <span className={`score ${cls}`} title="優先度スコア (緊急度×重要度 − 工数)">{value}</span>;
}
