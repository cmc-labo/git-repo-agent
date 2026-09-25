"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en, { MessageKey, Messages } from "./en";
import ja from "./ja";
import { findLanguage } from "./languages";

const LANG_KEY = "gra.lang";
const BUNDLED: Record<string, Messages> = { en, ja };

// 原文が変わったら翻訳キャッシュを作り直すためのハッシュ
function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const EN_HASH = hashOf(JSON.stringify(en));

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function loadMessages(lang: string): Promise<Messages> {
  if (BUNDLED[lang]) return BUNDLED[lang];
  const cacheKey = `gra.i18n.${lang}.${EN_HASH}`;
  const cached = storage()?.getItem(cacheKey);
  if (cached) return { ...en, ...JSON.parse(cached) };
  const res = await fetch(`/api/i18n/${encodeURIComponent(lang)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: en }),
  });
  if (!res.ok) throw new Error(`translation failed: ${res.status}`);
  const data = await res.json();
  if (!data.fallback) storage()?.setItem(cacheKey, JSON.stringify(data.entries));
  return { ...en, ...data.entries };
}

type Vars = Record<string, string | number | null | undefined>;

interface I18nCtx {
  lang: string | null; // null = まだ選択していない
  setLang: (code: string) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  fmtDate: (s: string | null | undefined, withTime?: boolean) => string;
  fmtMonth: (d: Date) => string;
  eventText: (message: string) => string;
  translating: boolean;
  translateError: boolean;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string | null>(null);
  const [messages, setMessages] = useState<Messages>(en);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const apply = useCallback(async (code: string) => {
    setLangState(code);
    const meta = findLanguage(code);
    document.documentElement.lang = code;
    document.documentElement.dir = meta?.rtl ? "rtl" : "ltr";
    setTranslateError(false);
    if (!BUNDLED[code]) setTranslating(true);
    try {
      setMessages(await loadMessages(code));
    } catch {
      setMessages(en);
      setTranslateError(true);
    } finally {
      setTranslating(false);
    }
  }, []);

  // 初回: ?lang=xx > 保存済みの言語 の順に適用し、どちらもなければ言語選択を表示
  useEffect(() => {
    const fromUrl = findLanguage(new URLSearchParams(window.location.search).get("lang"))?.code;
    if (fromUrl) storage()?.setItem(LANG_KEY, fromUrl);
    const saved = fromUrl ?? storage()?.getItem(LANG_KEY);
    if (saved && findLanguage(saved)) apply(saved);
    else setPickerOpen(true);
  }, [apply]);

  const setLang = useCallback(
    (code: string) => {
      storage()?.setItem(LANG_KEY, code);
      setPickerOpen(false);
      apply(code);
    },
    [apply],
  );

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => {
      const s = messages[key] ?? en[key] ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m).toString()) : s;
    },
    [messages],
  );

  const locale = lang || "en";
  const fmtDate = useCallback(
    (s: string | null | undefined, withTime = true) => {
      if (!s) return "-";
      const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
      if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
      try {
        return new Intl.DateTimeFormat(locale, opts).format(new Date(s));
      } catch {
        return new Date(s).toLocaleString();
      }
    },
    [locale],
  );
  const fmtMonth = useCallback(
    (d: Date) => {
      try {
        return new Intl.DateTimeFormat(locale, { month: "short" }).format(d);
      } catch {
        return String(d.getMonth() + 1);
      }
    },
    [locale],
  );

  // バックエンドのイベントは {"k": キー, "p": パラメータ} 形式 (旧形式の文字列はそのまま表示)
  const eventText = useCallback(
    (message: string) => {
      try {
        const { k, p } = JSON.parse(message) as { k: string; p: Vars };
        const vars: Vars = { ...p };
        if (p.trigger) vars.trigger = t(`trigger.${p.trigger}` as MessageKey);
        if (p.status) vars.status = t(`status.${p.status}` as MessageKey);
        const key = `ev.${k}` as MessageKey;
        return key in en ? t(key, vars) : message;
      } catch {
        return message;
      }
    },
    [t],
  );

  const value = useMemo<I18nCtx>(
    () => ({
      lang, setLang, t, fmtDate, fmtMonth, eventText, translating, translateError, pickerOpen,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
    }),
    [lang, setLang, t, fmtDate, fmtMonth, eventText, translating, translateError, pickerOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used inside I18nProvider");
  return c;
}

export type { MessageKey };
