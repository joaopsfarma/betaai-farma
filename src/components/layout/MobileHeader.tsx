import React from 'react';
import { Menu, X, Pill } from 'lucide-react';

interface MobileHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ isSidebarOpen, setIsSidebarOpen }) => {
  return (
    <div className="md:hidden bg-white border-b border-violet-100 p-4 flex items-center justify-between sticky top-0 z-30 shadow-sm shadow-violet-100/50">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-2 rounded-xl shadow-sm shadow-violet-200">
          <Pill className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent leading-tight">FarmaIA</h1>
        </div>
      </div>
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="p-2 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
};
