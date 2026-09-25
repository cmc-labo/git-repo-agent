import en from "./i18n/en";
import type { MessageKey } from "./i18n";

/** API のエラーコード (例: repo_exists) を翻訳キーに変換する. 未知のものはそのまま表示 */
export function errorText(e: unknown, t: (k: MessageKey) => string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const key = `err.${msg}` as MessageKey;
  return key in en ? t(key) : msg;
}
