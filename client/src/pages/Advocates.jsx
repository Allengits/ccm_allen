import React from 'react';
import { Users, ArrowRight } from 'lucide-react';

export default function Advocates() {
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200">
        <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
          Advocate Directory & Bar Registry
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Bar council enrollment verification, party representation, and legal counsel assignment.
        </p>
      </div>

      <div className="registry-card rounded-lg p-8 text-center legal-border bg-white space-y-4">
        <div className="w-12 h-12 rounded-full bg-brass-50 border border-brass-200 text-brass-700 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-xl font-bold text-navy-900">
          Advocate Assignment Module (Placeholder)
        </h2>
        <p className="text-sm text-gray-600 max-w-lg mx-auto">
          Advocate onboarding, case linkage, and appearance tracking will be available in future
          phases.
        </p>
        <div className="pt-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-800 border border-navy-200">
            <span>Upcoming Phase</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
