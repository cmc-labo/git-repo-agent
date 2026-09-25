// GA4 のカスタムイベント送信. gtag が読み込まれていない環境 (開発時・広告ブロック) では何もしない
type Gtag = (command: "event", name: string, params?: Record<string, unknown>) => void;

export function track(name: string, params?: Record<string, unknown>): void {
  const gtag = (globalThis as { gtag?: Gtag }).gtag;
  if (typeof gtag === "function") gtag("event", name, params);
}
