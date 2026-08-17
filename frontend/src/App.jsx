import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Composer } from './pages/Composer';
import { AgentsList } from './pages/AgentsList';
import { PhoneNumbers } from './pages/PhoneNumbers';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard/agents" replace />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Navigate to="agents" replace />} />
        <Route path="agents" element={<AgentsList />} />
        <Route path="agent/:id" element={<Composer />} />
        <Route path="phone-numbers" element={<PhoneNumbers />} />
      </Route>
    </Routes>
  );
}
