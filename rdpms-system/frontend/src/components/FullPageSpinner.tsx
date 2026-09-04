export function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-10 h-10 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">加载中…</p>
      </div>
    </div>
  );
}
