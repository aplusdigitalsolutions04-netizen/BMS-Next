// ════════════════════════════════════════════════════════════════
//  BRANDING CONFIG  —  change everything here
//  Changes take effect after a server restart.
// ════════════════════════════════════════════════════════════════

const branding = {

  // ── App Identity ─────────────────────────────────────────────
  // Shown in sidebar, login card, browser tab
  appName: 'BMS-APDS',

  // Logo: put the file in the public/ folder, then give its path
  //   '/aplus.png'  →  public/aplus.png    ← RECOMMENDED
  //   null          →  shows an initials badge instead
  logoPath: '/aplus.png' as string | null,

  // Browser tab icon (favicon): put the file in the public/ folder
  //   '/favicon.png'  →  public/favicon.png
  //   null            →  default favicon
  faviconPath: '/Apluslogo.jpeg' as string | null,

  // ── Header ───────────────────────────────────────────────────
  // Search box placeholder text
  searchPlaceholder: 'Search firms, documents, tags...',

  // ── Login Page ───────────────────────────────────────────────
  // Small line above the headline
  loginBadge: 'Bid & Document Management Portal',

  // Main headline — made up of 3 parts:
  //   "[loginHeadlinePre] [loginHeadlineAccent] [loginHeadlinePost]"
  //   The accent word is shown in the brand color
  loginHeadlinePre:    'One Platform for',
  loginHeadlineAccent: 'Bids,',
  loginHeadlinePost:   'Documents & Compliance.',

  // Feature list (left side, with checkmarks)
  loginFeatures: [
    'AI-powered bid analysis from PDF',
    'Multi-firm document management',
    'GEM order tracking & templates',
    'Expiry alerts & notifications',
    'Role-based access control (RBAC)',
    'Audit trail for all actions',
  ],

  // Badge chips (small labels below the features)
  loginChips: [
    'AI ANALYSIS',
    'RBAC ENABLED',
    'SMART ALERTS',

  ],

  // ── Brand Colors ─────────────────────────────────────────────
  // Hex color — used for buttons, icons, highlights
  // You can use any hex color:
  //   '#10b981'  →  green (emerald)
  //   '#2563eb'  →  blue
  //   '#7c3aed'  →  purple
  //   '#dc2626'  →  red
  accentColor: '#10b981',   // main color  (default: emerald)
  accentDark:  '#059669',   // hover color (slightly darker)
  accentLight: '#d1fae5',   // light bg

}

export default branding
