import React from 'react';
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved) {
      const darkMode = JSON.parse(saved);
      setIsDarkMode(darkMode);
      updateTheme(darkMode);
    }
  }, []);

  const updateTheme = (darkMode) => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#1a1a1a';
      document.body.style.color = '#ffffff';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = '#ffffff';
      document.body.style.color = '#000000';
    }
  };

  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    updateTheme(newDarkMode);
    localStorage.setItem('darkMode', JSON.stringify(newDarkMode));
  };

  return (
    <Button
      onClick={toggleTheme}
      className="fixed bottom-32 md:bottom-20 right-6 z-40 rounded-full shadow-lg transition-all hover:scale-110 print-hide"
      style={{
        backgroundColor: isDarkMode ? '#242526' : '#ffffff',
        color: isDarkMode ? '#e4e6eb' : '#050505',
        border: isDarkMode ? '1px solid #3a3b3c' : '1px solid #e5e7eb',
        padding: '6px 10px',
        fontSize: '12px',
        height: '32px',
        minWidth: 'auto'
      }}
      size="sm"
    >
      {isDarkMode ? (
        <>
          <Sun className="h-3 w-3 mr-1" />
          <span className="hidden md:inline">Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-3 w-3 mr-1" />
          <span className="hidden md:inline">Escuro</span>
        </>
      )}
    </Button>
  );
}