import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-bold text-gray-300">404</div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">页面不存在</h1>
        <p className="mt-2 text-sm text-gray-500">该地址可能已下线或输入有误（例如已移除的备份功能）。</p>
        <Link to="/" className="btn btn-primary mt-6 inline-block">
          返回仪表盘
        </Link>
      </div>
    </div>
  );
}
