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
    <aside className="w-64 h-screen fixed left-0 top-0 glass-panel border-r border-nexus-border z-40 flex flex-col justify-between hidden md:flex">
      
      {/* Logo Area */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-nexus-primary flex items-center justify-center text-white shadow-glow-primary">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">NEXUS</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium ${
                  isActive 
                  ? 'bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/5' 
                  : 'text-nexus-muted hover:text-white hover:bg-white/5'
                }`
              }
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Profile Area */}
      <div className="p-6 border-t border-white/5">
        <div className="flex items-center gap-3 mb-6 bg-black/30 p-3 rounded-2xl border border-white/5">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner relative"
            style={{ backgroundColor: user?.avatarColor || '#6C5CE7' }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-nexus-success rounded-full border-2 border-nexus-bg"></div>
          </div>
          <div className="flex-1 overflow-hidden">
            <h4 className="text-sm font-semibold truncate text-white">{user?.name}</h4>
            <p className="text-xs text-nexus-muted capitalize">{user?.role}</p>
          </div>
        </div>

        <button 
          onClick={logout}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-nexus-muted hover:text-nexus-danger hover:bg-nexus-danger/10 transition-colors font-medium text-sm border border-transparent hover:border-nexus-danger/20"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

    </aside>
  );
};
