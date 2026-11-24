"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PersonnelRole } from "@/lib/types";

interface DashboardAuthValue {
  role: PersonnelRole;
  fullName: string;
}

const DashboardAuthContext = createContext<DashboardAuthValue | null>(null);

export function DashboardAuthProvider({
  role,
  fullName,
  children,
}: DashboardAuthValue & { children: ReactNode }) {
  return (
    <DashboardAuthContext.Provider value={{ role, fullName }}>
      {children}
    </DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth(): DashboardAuthValue {
  const context = useContext(DashboardAuthContext);
  if (!context) throw new Error("Dashboard authentication context is unavailable.");
  return context;
}
