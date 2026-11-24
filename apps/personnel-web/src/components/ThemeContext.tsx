"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ThemeContextType {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (newTheme: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = (document.documentElement.getAttribute("data-theme") || localStorage.getItem("kalasag_theme")) as "light" | "dark" | null;
      if (savedTheme === "light" || savedTheme === "dark") {
        queueMicrotask(() => setThemeState(savedTheme));
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("kalasag_theme", theme);
    }
  }, [theme]);

  const setTheme = (newTheme: "light" | "dark") => {
    if (newTheme === "light" || newTheme === "dark") {
      setThemeState(newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
