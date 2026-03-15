'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div
        className={`w-14 h-8 rounded-full bg-white/5 border border-zinc-700 opacity-50 ${className ?? ""}`}
      />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`group relative flex items-center w-14 h-8 rounded-full p-1 cursor-pointer transition-colors duration-500 overflow-hidden border ${
        isDark
          ? "bg-slate-900 border-slate-700 hover:bg-sky-300 hover:border-sky-400"
          : "bg-sky-300 border-sky-400 hover:bg-slate-900 hover:border-slate-700"
      } ${className ?? ""}`}
      aria-label="Toggle theme"
    >
      {/* Handle */}
      <div
        className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500 transform ${
          isDark
            ? "translate-x-6 bg-slate-800 shadow-[0_0_12px_rgba(200,210,255,0.5)] group-hover:translate-x-0 group-hover:bg-yellow-400 group-hover:shadow-[0_0_10px_rgba(250,204,21,0.8)]"
            : "translate-x-0 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)] group-hover:translate-x-6 group-hover:bg-slate-800 group-hover:shadow-[0_0_12px_rgba(200,210,255,0.5)]"
        }`}
      >
        <div className="relative w-4 h-4">
          {/* Sun Icon */}
          <svg
            className={`absolute inset-0 w-full h-full transition-all duration-500 ${
              isDark
                ? "opacity-0 rotate-90 scale-50 group-hover:opacity-100 group-hover:rotate-0 group-hover:scale-100"
                : "opacity-100 rotate-0 scale-100 group-hover:opacity-0 group-hover:rotate-90 group-hover:scale-50"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" fill="#fff" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>

          {/* Moon Icon */}
          <svg
            className={`absolute inset-0 w-full h-full transition-all duration-500 text-blue-100 ${
              isDark
                ? "opacity-100 rotate-0 scale-100 group-hover:opacity-0 group-hover:-rotate-90 group-hover:scale-50"
                : "opacity-0 -rotate-90 scale-50 group-hover:opacity-100 group-hover:rotate-0 group-hover:scale-100"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </button>
  );
}
