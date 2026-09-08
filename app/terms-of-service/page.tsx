import Link from 'next/link'
import branding from '@/src/config/branding'

export const metadata = {
  title: `Terms of Service — ${branding.appName}`,
}

export default function TermsOfServicePage() {
  const updated = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-700">&larr; Back to {branding.appName}</Link>

        <h1 className="text-3xl font-bold text-slate-900 mt-4">Terms of Service</h1>
        <p className="text-sm text-slate-400 mt-1">Last updated: {updated}</p>

        <div className="mt-8 space-y-8 text-slate-700 text-sm leading-relaxed">
          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern access to and use of {branding.appName} (&quot;the Portal&quot;),
              an internal Bid &amp; Document Management system provided for use by authorized employees and representatives
              of registered firms. By logging into or using the Portal, you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Authorized Use</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>The Portal is provided for internal business use only — bid analysis, document management, firm/vendor records, and related administrative workflows.</li>
              <li>Access is granted per user account by an administrator. Accounts are not transferable, and credentials must not be shared.</li>
              <li>Users must only access data and features their assigned role permits, and must not attempt to circumvent role-based access controls.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">2. User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>You are responsible for the accuracy of information you enter or upload (firm details, bid data, documents).</li>
              <li>You must not upload unlawful, infringing, or malicious content to the Portal.</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.</li>
              <li>Actions taken in the Portal are recorded in an audit trail; users are accountable for actions performed under their account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">3. AI-Assisted Features</h2>
            <p>The Portal may use AI to analyze uploaded bid documents, extract terms and conditions, and generate document content. AI-generated output (summaries, extracted terms, drafted documents) is provided as an aid and must be reviewed by a user before being relied upon for any bid submission or contractual decision. {branding.appName} does not guarantee the accuracy or completeness of AI-generated content.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Document Storage</h2>
            <p>Files uploaded to the Portal are stored via Google Drive under the organization&apos;s authorized account. Users are responsible for ensuring they have the right to upload any document they submit to the Portal.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Availability</h2>
            <p>The Portal is provided on an &quot;as available&quot; basis. We aim for reliable uptime but do not guarantee uninterrupted access, and the Portal may be temporarily unavailable for maintenance or updates.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, {branding.appName} and its operators are not liable for indirect, incidental, or consequential damages arising from use of the Portal, including reliance on AI-generated content or decisions made based on data stored in the Portal. Users remain responsible for independently verifying bid, contract, and compliance information before acting on it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Account Suspension</h2>
            <p>An administrator may suspend or deactivate a user account at any time, including for misuse of the Portal or violation of these Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the Portal after changes take effect constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Contact</h2>
            <p>For questions about these Terms, please contact your organization&apos;s Portal administrator.</p>
          </section>

          <section>
            <p className="text-slate-500">See also our <Link href="/privacy-policy" className="underline hover:text-slate-700">Privacy Policy</Link>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
