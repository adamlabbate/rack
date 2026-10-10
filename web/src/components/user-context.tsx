"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getUsers, type User } from "@/lib/api";

const STORAGE_KEY = "pull.userId";

type UserContextValue = {
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
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

  return (
    <UserContext.Provider value={{ users, currentUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
