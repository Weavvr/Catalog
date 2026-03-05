import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutGrid,
  Hammer,
  MessageSquare,
  ClipboardList,
  Boxes,
  BarChart3,
  GitBranch,
  ArrowRightLeft,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    ],
  },
  {
    label: 'Feature Library',
    items: [
      { to: '/features', label: 'Feature Browser', icon: LayoutGrid },
      { to: '/builder', label: 'App Builder', icon: Hammer },
      { to: '/assistant', label: 'AI Assistant', icon: MessageSquare },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/migration', label: 'Migration Tracker', icon: ArrowRightLeft },
      { to: '/pipeline', label: 'Update Pipeline', icon: GitBranch },
      { to: '/requests', label: 'Request Queue', icon: ClipboardList },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Admin Dashboard',
  '/features': 'Feature Browser',
  '/builder': 'App Builder',
  '/assistant': 'AI Assistant',
  '/requests': 'Request Queue',
  '/migration': 'Migration Tracker',
  '/pipeline': 'Update Pipeline',
};

export default function Layout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const pageTitle = PAGE_TITLES[currentPath] || 'HMC Platform';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-gray-200">
          <Boxes className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">HMC Platform</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Feature Library & App Builder</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon }) => {
                  const active = currentPath === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">45 packages &middot; 51 features &middot; v1.0.0</p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">{pageTitle}</h2>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
