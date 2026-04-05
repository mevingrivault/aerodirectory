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
import type { UserProfile, AuthTokens } from "@aerodirectory/shared";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requireTotp: boolean }>;
  register: (email: string, password: string, displayName?: string) => Promise<string>;
  logout: () => void;
  verifyTotp: (code: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get<UserProfile>("/auth/profile");
      setUser(res.data);
    } catch {
      setUser(null);
      apiClient.setToken(null);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("accessToken")
      : null;

    if (token) {
      apiClient.setToken(token);
      fetchProfile().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchProfile]);

  const storeTokens = (tokens: AuthTokens) => {
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
    apiClient.setToken(tokens.accessToken);
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<{ requireTotp: boolean }> => {
    const res = await apiClient.post<AuthTokens & { requireTotp: boolean }>(
      "/auth/login",
      { email, password },
    );

    if (res.data.requireTotp) {
      apiClient.setToken(res.data.accessToken);
    } else {
      storeTokens(res.data);
      await fetchProfile();
    }

    return { requireTotp: res.data.requireTotp };
  };

  const register = async (
    email: string,
    password: string,
    displayName?: string,
  ) => {
    const res = await apiClient.post<{ message: string }>("/auth/register", {
      email,
      password,
      displayName,
    });
    return res.data.message;
  };

  const verifyTotp = async (code: string) => {
    const res = await apiClient.post<AuthTokens>("/auth/login/totp", {
      code,
    });
    storeTokens(res.data);
    await fetchProfile();
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    apiClient.setToken(null);
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
