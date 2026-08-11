import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Video, BarChart2, Settings, LogOut, BrainCircuit } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';


export const Sidebar = () => {
  const { user, logout } = useAuthStore();

  const links = [
    { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Overview' },
    { to: '/meetings', icon: <Video className="w-5 h-5" />, label: 'Meetings' },
    { to: '/analytics', icon: <BarChart2 className="w-5 h-5" />, label: 'Analytics' },
    { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings' },
  ];

  return (
    <aside className="w-16 h-screen fixed left-0 top-0 bg-nexus-surface border-r border-nexus-border z-40 flex flex-col items-center justify-between py-4 hidden md:flex">
      
      {/* Logo */}
      <div className="flex flex-col items-center gap-8">
        <div className="w-10 h-10 rounded-card bg-nexus-signal flex items-center justify-center text-white">
          <BrainCircuit className="w-5 h-5" />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col items-center gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 
                `group relative w-10 h-10 rounded-card flex items-center justify-center transition-all duration-200 ${
                  isActive 
                  ? 'bg-nexus-primary/15 text-white' 
                  : 'text-nexus-muted hover:text-white hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-nexus-signal" />
                  )}
                  {link.icon}
                  {/* Tooltip with anti-flash delay */}
                  <span className="absolute left-14 px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity delay-200 group-hover:opacity-100 bg-nexus-surface border border-nexus-border rounded-md pointer-events-none z-50">
                    {link.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Avatar + Logout */}
      <div className="flex flex-col items-center gap-2">
        <div className="group relative">
          <div 
            className="w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm text-white relative cursor-default"
            style={{ backgroundColor: user?.avatarColor || '#5B57FF' }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-nexus-success rounded-full border-2 border-nexus-surface" />
          </div>
          {/* Tooltip */}
          <span className="absolute left-14 px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity delay-200 group-hover:opacity-100 bg-nexus-surface border border-nexus-border rounded-md pointer-events-none z-50">
            {user?.name}
          </span>
        </div>

        <button 
          onClick={logout}
          className="group relative w-10 h-10 rounded-card flex items-center justify-center text-nexus-muted hover:text-nexus-danger hover:bg-nexus-danger/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="absolute left-14 px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity delay-200 group-hover:opacity-100 bg-nexus-surface border border-nexus-border rounded-md pointer-events-none z-50">
            Sign Out
          </span>
        </button>
      </div>

    </aside>
  );
};
