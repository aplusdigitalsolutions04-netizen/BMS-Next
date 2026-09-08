import Link from 'next/link'
import branding from '@/src/config/branding'

export const metadata = {
  title: `Privacy Policy — ${branding.appName}`,
}

export default function PrivacyPolicyPage() {
  const updated = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-700">&larr; Back to {branding.appName}</Link>

        <h1 className="text-3xl font-bold text-slate-900 mt-4">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mt-1">Last updated: {updated}</p>

        <div className="mt-8 space-y-8 text-slate-700 text-sm leading-relaxed">
          <section>
            <p>
              This Privacy Policy explains how {branding.appName} (&quot;we&quot;, &quot;us&quot;, &quot;the Portal&quot;) collects,
              uses, stores, and protects information when your organization uses this Bid &amp; Document Management Portal.{' '}
              {branding.appName} is an internal business tool used by authorized employees and representatives of firms
              registered on the Portal — it is not a public consumer service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Information We Collect</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>Account information:</strong> name, username, email address, role, and login activity for users created by an administrator.</li>
              <li><strong>Firm &amp; vendor information:</strong> company name, PAN/GST numbers, contact details, and banking details entered for firm management.</li>
              <li><strong>Documents &amp; files:</strong> bid PDFs, contracts, compliance certificates, templates, and other files uploaded to the Portal, stored via Google Drive under the organization&apos;s own Drive account.</li>
              <li><strong>Bid &amp; tender data:</strong> content extracted or entered from tender documents (e.g. GeM bid PDFs) for AI-assisted analysis and record-keeping.</li>
              <li><strong>Usage &amp; audit data:</strong> actions taken within the Portal (created, updated, approved, deleted) are logged in an audit trail for accountability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">2. How We Use Information</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>To operate core Portal features: bid analysis, document storage, expiry tracking, and reporting.</li>
              <li>To authenticate users and enforce role-based access control (RBAC), so users only see data their role permits.</li>
              <li>To send operational notifications (e.g. document expiry alerts, approval reminders) by email or in-app notification.</li>
              <li>To maintain an audit trail of actions for compliance and internal accountability.</li>
              <li>We do not sell, rent, or use your organization&apos;s data for advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Storage &amp; Third-Party Services</h2>
            <p>Uploaded files are stored in Google Drive under the account your organization has authorized — Google&apos;s own privacy and security practices apply to that storage layer. Structured data (bids, firms, documents, users) is stored in a private database accessible only to authorized Portal users. Where AI-assisted analysis is used (e.g. extracting terms from a bid PDF), the relevant document text may be sent to the configured AI provider solely to generate that analysis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Data Retention &amp; Deletion</h2>
            <p>Most records in the Portal are &quot;soft-deleted&quot; when removed — they are hidden from normal views but retained so deletions can be reversed or audited if needed. Administrators may request permanent removal of specific records; contact your Portal administrator to make such a request.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Security</h2>
            <p>Access to the Portal requires authentication, and actions are scoped by role-based permissions. We take reasonable technical measures to protect data in transit and at rest, but no system can be guaranteed 100% secure. Users are responsible for keeping their own login credentials confidential.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Your Rights</h2>
            <p>If you are a user of this Portal, you may request access to, correction of, or deletion of your personal account information by contacting your organization&apos;s Portal administrator.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the &quot;Last updated&quot; date above.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Contact</h2>
            <p>For questions about this Privacy Policy or how your data is handled, please contact your organization&apos;s Portal administrator.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
