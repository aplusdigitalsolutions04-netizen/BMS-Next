// Next.js shows this instantly for any navigation into app/(app)/* (dashboard, firms,
// documents, ...) while that route segment's JS chunk compiles/loads and its data fetches --
// without it, the browser has nothing to paint during that gap and the page just goes blank
// until everything is ready, which is what made post-login navigation look broken.
export default function AppLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
