import React, { useState, useEffect } from 'react';
import { Landmark, Clock, UserCheck } from 'lucide-react';

export default function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm flex-shrink-0">
      {/* Court Title & Jurisdiction */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-navy-50 text-navy-900 rounded border border-navy-100 hidden sm:flex">
          <Landmark className="w-5 h-5 text-brass-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-navy-900 leading-tight">
            District & Sessions Judicial Court Complex
          </h2>
          <p className="text-xs text-gray-500">
            National E-Courts Case Allocation & Tracking Portal
          </p>
        </div>
      </div>

      {/* Right Controls: Clock & Role Preview */}
      <div className="flex items-center space-x-5">
        {/* Clock */}
        <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
          <Clock className="w-3.5 h-3.5 text-navy-700" />
          <span>{formattedDate}</span>
          <span className="text-gray-300">|</span>
          <span className="font-semibold text-navy-900">{formattedTime} IST</span>
        </div>

        {/* User Role Indicator */}
        <div className="flex items-center space-x-3 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-navy-900 text-brass-300 flex items-center justify-center font-serif font-bold text-xs shadow-inner">
            RC
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-semibold text-navy-900 leading-tight">
              Registrar Court Clerk
            </div>
            <div className="text-[10px] text-gray-500 flex items-center space-x-1">
              <UserCheck className="w-3 h-3 text-emerald-600 inline" />
              <span>Registry Division</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
