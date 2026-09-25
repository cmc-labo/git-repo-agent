"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// サイトキーは公開前提の値. 開発時は Cloudflare のテスト用キー (常に成功) を使い、localhost の登録を不要にする
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
  (process.env.NODE_ENV === "production" ? "0x4AAAAAAFDfvAp4yhWzW3a1" : "1x00000000000000000000AA");

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare Turnstile ウィジェット. 検証に通るとトークンを、失効・失敗すると null を渡す. resetKey を変えると再検証する */
export default function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.turnstile) setReady(true); // 別ページから戻ってきた場合はスクリプト読み込み済み
  }, []);

  useEffect(() => {
    if (!ready || !el.current || !window.turnstile || !TURNSTILE_SITE_KEY) return;
    widget.current = window.turnstile.render(el.current, {
      sitekey: TURNSTILE_SITE_KEY,
      language: "auto",
      // 通常は表示せずバックグラウンドで判定し、操作が必要なときだけウィジェットを出す
      appearance: "interaction-only",
      callback: (t: string) => cb.current(t),
      "expired-callback": () => cb.current(null),
      "error-callback": () => cb.current(null),
    });
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      window.turnstile?.reset(widget.current);
      cb.current(null);
    }
  }, [resetKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={el} className="turnstile" />
    </>
  );
}
