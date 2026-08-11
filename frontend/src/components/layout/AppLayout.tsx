import React from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="relative min-h-screen text-nexus-text bg-nexus-bg">
      {/* Layout Wrapper */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 md:ml-16 h-full overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full py-6 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
