import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { setAuthToken, registerUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await api.get("/favorites");
      const items = res.data?.data || [];
      setFavoriteIds(
        new Set(items.map((f) => f.travel?._id || f.travel).filter(Boolean)),
      );
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  const clearSession = useCallback((expired = false) => {
    setAuthToken(null);
    setUser(null);
    setFavoriteIds(new Set());
    if (expired) {
      setSessionExpired(true);
    }
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearSession(true);
    });

    // Clear any legacy tokens from earlier versions that stored JWTs in localStorage
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
    } catch {
      // ignore storage restrictions
    }

    let active = true;
    (async () => {
      try {
        const res = await api.get("/auth/me");
        if (active && res.data?.user) {
          setUser(res.data.user);
          await loadFavorites();
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [clearSession, loadFavorites]);

  const login = useCallback(
    async (credentials) => {
      const res = await api.post("/login", credentials);
      const { token, user: loggedInUser } = res.data;
      setAuthToken(token);
      setUser(loggedInUser);
      setSessionExpired(false);
      await loadFavorites();
      return loggedInUser;
    },
    [loadFavorites],
  );

  const signup = useCallback(async ({ username, email, password }) => {
    const res = await api.post("/signup", { username, email, password });
    return res.data;
  }, []);

  const claimInitialAdmin = useCallback(
    async ({ username, email, password, setupSecret }) => {
      const res = await api.post("/auth/claim-admin", {
        username,
        email,
        password,
        setupSecret,
      });
      const { token, user: adminUser } = res.data;
      setAuthToken(token);
      setUser(adminUser);
      setSessionExpired(false);
      await loadFavorites();
      return adminUser;
    },
    [loadFavorites],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // proceed with local state cleanup even if network fails
    }
    clearSession(false);
  }, [clearSession]);

  const toggleFavorite = useCallback(
    async (travelId) => {
      if (!user) {
        return { requiresAuth: true };
      }
      const isCurrentlyFav = favoriteIds.has(travelId);
      if (isCurrentlyFav) {
        await api.delete(`/favorites/${travelId}`);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(travelId);
          return next;
        });
        return { isFavorite: false };
      }
      await api.post("/favorites", { travelId });
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.add(travelId);
        return next;
      });
      return { isFavorite: true };
    },
    [user, favoriteIds],
  );

  const updateUserState = useCallback((updatedUser) => {
    setUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        favoriteIds,
        sessionExpired,
        setSessionExpired,
        login,
        signup,
        claimInitialAdmin,
        logout,
        toggleFavorite,
        loadFavorites,
        updateUserState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
