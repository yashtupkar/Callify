import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Composer } from './pages/Composer';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard/composer" replace />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Navigate to="composer" replace />} />
        <Route path="composer" element={<Composer />} />
      </Route>
    </Routes>
  );
}
