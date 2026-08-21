import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Composer } from './pages/Composer';
import { Assistants } from './pages/Assistants';
import { AssistantEditor } from './pages/AssistantEditor';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard/assistants" replace />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Navigate to="assistants" replace />} />
        <Route path="composer" element={<Composer />} />
        <Route path="assistants" element={<Assistants />} />
        <Route path="assistants/:id" element={<AssistantEditor />} />
      </Route>
    </Routes>
  );
}
