"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiClient } from "./api-client";
import type { UserProfile } from "@aerodirectory/shared";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    rememberMe: boolean,
    altcha?: string,
  ) => Promise<{ requireTotp: boolean }>;
  register: (email: string, password: string, displayName: string, altcha?: string) => Promise<string>;
  logout: () => Promise<void>;
  verifyTotp: (code: string, rememberMe: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get<UserProfile>("/auth/profile");
      setUser(res.data ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  // Au démarrage : on tente de récupérer le profil via le cookie httpOnly
  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean,
    altcha?: string,
  ): Promise<{ requireTotp: boolean }> => {
    const res = await apiClient.post<{ requireTotp: boolean }>(
      "/auth/login",
      { email, password, rememberMe },
      altcha ? { "x-altcha": altcha } : undefined,
    );

    if (!res.data.requireTotp) {
      await fetchProfile();
    }

    return { requireTotp: res.data.requireTotp };
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
    altcha?: string,
  ) => {
    const res = await apiClient.post<{ message: string }>(
      "/auth/register",
      { email, password, displayName },
      altcha ? { "x-altcha": altcha } : undefined,
    );
    return res.data.message;
  };

  const verifyTotp = async (code: string, rememberMe: boolean) => {
    await apiClient.post("/auth/login/totp", { code, rememberMe });
    await fetchProfile();
  };

  const logout = async () => {
    await apiClient.post("/auth/logout").catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, verifyTotp, refreshProfile: fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
