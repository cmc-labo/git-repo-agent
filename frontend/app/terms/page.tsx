import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Git Repository Agent",
};

// 利用規約 (英語のみ). 原文: dev/project/ref/0925/利用規約.txt
export default function TermsPage() {
  return (
    <div className="container terms" lang="en" dir="ltr">
      <article className="card">
        <h1>Terms of Service</h1>
        <p className="muted small">Last Updated: September 26, 2026</p>

        <h2>Article 1 (Applicability)</h2>
        <p>
          These Terms of Service (hereinafter referred to as the &quot;Terms&quot;) define the conditions for providing
          &quot;Git Repository Agent&quot; (hereinafter referred to as the &quot;Service&quot;) and the rights and
          obligations between the operator and the users regarding the use of the Service. By using the Service, the
          user is deemed to have agreed to these Terms.
        </p>

        <h2>Article 2 (Service Overview)</h2>
        <p>
          The Service uses AI to analyze GitHub repository information submitted by users to provide competitive
          analysis, task prioritization, roadmap generation, and other project management support.
        </p>

        <h2>Article 3 (Data Management and Identification)</h2>
        <p>
          The Service does not require individual user account registration. Instead, browser identifiers (such as
          Cookies / LocalStorage) are used to associate data and access permissions with the user.
        </p>
        <p>
          If a user clears their browser&apos;s site data, access to previously registered data and settings may be
          lost. The operator assumes no responsibility for any damages arising from such data loss.
        </p>

        <h2>Article 4 (Prohibited Activities)</h2>
        <p>Users shall not engage in any of the following activities when using the Service:</p>
        <ol>
          <li>Actions that violate laws, regulations, or public order and morals.</li>
          <li>Registering or analyzing private repositories without proper access authorization.</li>
          <li>Sending an excessive amount of automated requests using scripts, bots, or scrapers.</li>
          <li>
            Actions that impose an unreasonable or disproportionately large load on the Service&apos;s servers or network
            infrastructure.
          </li>
          <li>Actions that interfere with or disrupt the operation of the Service.</li>
        </ol>

        <h2>Article 5 (AI-Generated Content and Disclaimer)</h2>
        <p>
          Analysis results, task priorities, competitive insights, Gantt charts, and other AI-generated content
          provided by the Service are for reference purposes only. The operator makes no guarantees regarding their
          accuracy, completeness, or usefulness.
        </p>
        <p>
          The operator shall not be held liable for any direct or indirect damages incurred by the user arising from
          the use of, or inability to use, the Service.
        </p>
        <p>
          Features of the Service may be temporarily or permanently modified, suspended, or discontinued due to
          specification changes or outages in GitHub or other integrated third-party services.
        </p>

        <h2>Article 6 (Modifications to Terms)</h2>
        <p>
          The operator reserves the right to modify these Terms at any time without prior notice to users. The modified
          Terms shall become effective immediately upon being posted on this website.
        </p>

        <p className="terms-back">
          <Link href="/">← Git Repository Agent</Link>
        </p>
      </article>
    </div>
  );
}
