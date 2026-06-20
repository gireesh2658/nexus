import React from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="relative min-h-screen text-nexus-text overflow-hidden bg-nexus-bg">
      {/* Layout Wrapper */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 md:ml-64 h-full overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth">
          <div className="absolute inset-0 bg-gradient-to-b from-nexus-bg/0 via-nexus-bg/50 to-nexus-bg pointer-events-none -z-10" />
          <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
