import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import Hearings from './pages/Hearings';
import Advocates from './pages/Advocates';
import Evidence from './pages/Evidence';
import Judgments from './pages/Judgments';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="cases" element={<Cases />} />
          <Route path="hearings" element={<Hearings />} />
          <Route path="advocates" element={<Advocates />} />
          <Route path="evidence" element={<Evidence />} />
          <Route path="judgments" element={<Judgments />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
