import { Injectable } from '@angular/core';

const THEME_KEY = 'app-theme';
export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private theme: Theme = 'light';

  constructor() {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    this.setTheme(saved === 'dark' ? 'dark' : 'light');
  }

  getTheme(): Theme {
    return this.theme;
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}
