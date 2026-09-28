export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="glass flex flex-col items-center space-y-3 px-10 py-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/70 border-t-primary-500" />
        <p className="text-sm text-gray-600">加载中…</p>
      </div>
    </div>
  );
}
