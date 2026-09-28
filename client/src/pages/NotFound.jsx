import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-full bg-navy-50 text-navy-800 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-brass-600" />
      </div>
      <h1 className="font-serif text-3xl font-bold text-navy-900 mb-2">404 - Record Not Found</h1>
      <p className="text-sm text-gray-600 max-w-md mb-6">
        The judicial registry docket or view you requested does not exist or has been relocated.
      </p>
      <Link
        to="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-medium hover:bg-navy-800 transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Dashboard</span>
      </Link>
    </div>
  );
}
