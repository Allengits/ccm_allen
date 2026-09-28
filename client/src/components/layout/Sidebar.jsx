import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  Users as UsersIcon,
  Scale,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';

const allNavigationItems = [
  {
    name: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'],
  },
  {
    name: 'Cases',
    path: '/cases',
    icon: Briefcase,
    roles: ['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'],
  },
  {
    name: 'Hearings',
    path: '/hearings',
    icon: Calendar,
    roles: ['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'],
  },
  {
    name: 'Advocates',
    path: '/advocates',
    icon: UsersIcon,
    roles: ['ADMIN', 'REGISTRAR', 'JUDGE'],
  },
  {
    name: 'My Profile',
    path: '/advocates',
    icon: UserCheck,
    roles: ['ADVOCATE'],
  },
  {
    name: 'Judgments',
    path: '/judgments',
    icon: Scale,
    roles: ['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'],
  },
  {
    name: 'User Management',
    path: '/users',
    icon: UserCheck,
    roles: ['ADMIN'],
  },
];

export default function Sidebar() {
  const { user } = useAuth();

  // Filter navigation items strictly permitted for current role
  const visibleItems = allNavigationItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="w-64 bg-navy-900 text-white flex flex-col flex-shrink-0 shadow-xl border-r border-navy-800">
      {/* Court Header / Seal */}
      <div className="p-5 border-b border-navy-800 bg-navy-950 flex items-center space-x-3">
        <div className="w-10 h-10 rounded-lg bg-brass-500/20 border border-brass-400/40 flex items-center justify-center text-brass-400">
          <Scale className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-serif text-lg font-bold text-white tracking-wide leading-tight">
            Court CMS
          </h1>
          <p className="text-xs text-brass-400 font-medium tracking-wider uppercase">
            Judicial Registry
          </p>
        </div>
      </div>

      {/* Role-Filtered Navigation Menu */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-navy-400 uppercase">
          Authorized Portals
        </div>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brass-500 text-white shadow-md'
                    : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* System Status / Current User Role Badge */}
      <div className="p-4 border-t border-navy-800 bg-navy-950/60 text-xs">
        <div className="flex items-center space-x-2 text-navy-300 mb-2">
          <ShieldCheck className="w-4 h-4 text-brass-400" />
          <span className="font-medium text-navy-200">Active Credential</span>
        </div>
        <div className="bg-navy-900 rounded p-2.5 border border-navy-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-navy-400">Role</span>
            <span className="text-brass-300 font-semibold">{user?.role}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1">
            <span className="text-navy-400">Security</span>
            <span className="text-emerald-400 font-medium">RBAC Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
