"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getUsers, type User } from "@/lib/api";

const STORAGE_KEY = "rack.userId";

type UserContextValue = {
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  updateUser: (user: User) => void; // after the API changed it (e.g. a new full-body photo)
};

const UserContext = createContext<UserContextValue | null>(null);

// No real auth yet: the header switcher picks which seeded user you are.
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);

  useEffect(() => {
    getUsers()
      .then((list) => {
        setUsers(list);
        let savedId: number | null = null;
        try {
          savedId = Number(localStorage.getItem(STORAGE_KEY));
        } catch {}
        setCurrentUserState(list.find((u) => u.id === savedId) ?? list[0] ?? null);
      })
      .catch((err) => console.error("Could not load users", err));
  }, []);

  function setCurrentUser(user: User) {
    setCurrentUserState(user);
    try {
      localStorage.setItem(STORAGE_KEY, String(user.id));
    } catch {}
  }

  function updateUser(user: User) {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
    setCurrentUserState((prev) => (prev?.id === user.id ? user : prev));
  }

  return (
    <UserContext.Provider value={{ users, currentUser, setCurrentUser, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
