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
  const [themeInitialized, setThemeInitialized] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("kalasag_theme");
    queueMicrotask(() => {
      if (savedTheme === "light" || savedTheme === "dark") {
        setThemeState(savedTheme);
      }
      setThemeInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (!themeInitialized) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("kalasag_theme", theme);
  }, [theme, themeInitialized]);

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
