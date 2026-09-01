import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { SERVER_URL } from '@/lib/constants';

axios.defaults.withCredentials = true;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/auth/me`);
      setUser(res.data.user);
      setAgents(res.data.agents || []);
    } catch (err) {
      setUser(null);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    setError(null);
    try {
      const res = await axios.post(`${SERVER_URL}/api/auth/login`, { email, password });
      setUser(res.data.user);
      await refresh();
      return res.data.user;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to sign in';
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (email, password, name) => {
    setError(null);
    try {
      const res = await axios.post(`${SERVER_URL}/api/auth/register`, { email, password, name });
      setUser(res.data.user);
      await refresh();
      return res.data.user;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to register';
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try { await axios.post(`${SERVER_URL}/api/auth/logout`); } catch {}
    setUser(null);
    setAgents([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        agents,
        loading,
        error,
        login,
        register,
        logout,
        refresh,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
