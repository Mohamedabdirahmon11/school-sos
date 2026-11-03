/**
 * Authentication and Multi-Language Context Provider
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, School, UserRole } from '../types/index.ts';
import { ApiClient } from '../services/api.ts';
import { translations, LanguageCode, TranslationDict } from '../lib/translations.ts';

interface AuthContextType {
  user: User | null;
  school: School | null;
  currentRole: UserRole | null;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: keyof TranslationDict) => string;
  login: (credentials: any) => Promise<any>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  viewAsSchool: (school: School | null) => void;
  inspectedSchool: School | null;
  isLoading: boolean;
  isReadOnly: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [inspectedSchool, setInspectedSchool] = useState<School | null>(null);
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const t = useCallback((key: keyof TranslationDict): string => {
    const dict = translations[language] || translations.en;
    return dict[key] || translations.en[key] || String(key);
  }, [language]);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    ApiClient.setLanguage(lang);
  };

  const refreshUser = useCallback(async () => {
    try {
      const data = await ApiClient.getMe();
      if (data && data.user) {
        setUser(data.user);
        setSchool(data.school);
        setSessionTimeoutMinutes(data.sessionTimeoutMinutes || 60);
      } else {
        setUser(null);
        setSchool(null);
      }
    } catch {
      // Not authenticated or session expired
      setUser(null);
      setSchool(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedLang = ApiClient.getLanguage();
    if (savedLang) setLanguageState(savedLang);
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      if ((event as CustomEvent<{ status: number }>).detail?.status !== 401) return;
      setUser(null);
      setSchool(null);
      setInspectedSchool(null);
    };
    window.addEventListener('schoolos:api-error', handleUnauthorized);
    return () => window.removeEventListener('schoolos:api-error', handleUnauthorized);
  }, []);

  useEffect(() => {
    const handleMustChangePassword = () => { void refreshUser(); };
    window.addEventListener('schoolos:must-change-password', handleMustChangePassword);
    return () => window.removeEventListener('schoolos:must-change-password', handleMustChangePassword);
  }, [refreshUser]);

  // Session timeout activity listener
  useEffect(() => {
    if (!user) return;
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      // Default 60 mins session inactivity timeout
      timer = setTimeout(() => {
        logout();
      }, sessionTimeoutMinutes * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [user, sessionTimeoutMinutes]);

  const login = async (credentials: any) => {
    const res = await ApiClient.login(credentials);
    if (res.user) {
      setUser(res.user);
      setSchool(res.school);
      setSessionTimeoutMinutes(res.sessionTimeoutMinutes || 60);
    } else {
      await refreshUser();
    }
    return res;
  };

  const logout = async () => {
    await ApiClient.logout().catch(() => {});
    setUser(null);
    setSchool(null);
    setInspectedSchool(null);
  };

  const viewAsSchool = (targetSchool: School | null) => {
    setInspectedSchool(targetSchool);
  };

  const activeSchool = inspectedSchool || school;
  const isReadOnly = !activeSchool?.subscription || activeSchool.subscription.status === 'read_only';

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-color', activeSchool?.brandColor || '#0F766E');
  }, [activeSchool?.brandColor]);

  useEffect(() => {
    if (activeSchool?.language && !ApiClient.hasLanguagePreference()) {
      setLanguageState(activeSchool.language);
    }
  }, [activeSchool?.id, activeSchool?.language]);

  return (
    <AuthContext.Provider
      value={{
        user,
        school: activeSchool,
        currentRole: user?.role || null,
        language,
        setLanguage,
        t,
        login,
        logout,
        refreshUser,
        viewAsSchool,
        inspectedSchool,
        isLoading,
        isReadOnly
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
