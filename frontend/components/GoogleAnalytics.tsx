import Script from "next/script";

// Google Analytics 4 (gtag.js). 本番ビルドでのみ読み込む (ローカル開発のアクセスを計測しないため)
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-P3Q69KW39P";

export default function GoogleAnalytics() {
  if (!GA_ID || process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
