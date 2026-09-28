import React from 'react';
import { Calendar, ArrowRight } from 'lucide-react';

export default function Hearings() {
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200">
        <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
          Hearing Calendar & Cause Lists
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Daily court schedules, courtroom allocation, bench assignment, and proceedings tracking.
        </p>
      </div>

      <div className="registry-card rounded-lg p-8 text-center legal-border bg-white space-y-4">
        <div className="w-12 h-12 rounded-full bg-brass-50 border border-brass-200 text-brass-700 flex items-center justify-center mx-auto">
          <Calendar className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-xl font-bold text-navy-900">
          Hearing Scheduling Module (Placeholder)
        </h2>
        <p className="text-sm text-gray-600 max-w-lg mx-auto">
          Automated hearing scheduling, courtroom roster management, and cause list publication will
          be activated in upcoming phases.
        </p>
        <div className="pt-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-800 border border-navy-200">
            <span>Scheduled for Phase 3</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
