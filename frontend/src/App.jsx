import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AgentStudioPage from './pages/AgentStudioPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/agents" replace />} />
        <Route path="/agents" element={<AgentStudioPage />} />
        <Route path="/agents/:agentId" element={<AgentStudioPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
