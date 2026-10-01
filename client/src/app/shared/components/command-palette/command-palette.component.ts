import { Component, ElementRef, ViewChild, computed, effect, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommandPaletteService } from 'src/app/core/services/command-palette.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { LayoutService } from 'src/app/core/services/layout.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import { buildNavEntries } from '../../constants/nav-menu';

interface PaletteItem {
  id: string;
  label: string;
  context: string;
  icon: string;
  run: () => void;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [IconsModule],
  templateUrl: './command-palette.component.html',
})
export class CommandPaletteComponent {
  @ViewChild('queryInput') queryInput?: ElementRef<HTMLInputElement>;

  readonly query = signal('');
  readonly activeIndex = signal(0);

  private readonly employee = toSignal(this._employeeService.employeeData$);

  private readonly allItems = computed<PaletteItem[]>(() => {
    const pages = buildNavEntries(this.employee()?.category.privileges).map((entry) => ({
      id: 'page:' + entry.route,
      label: entry.label,
      context: entry.context,
      icon: entry.icon,
      run: () => this._router.navigateByUrl(entry.route),
    }));
    const actions: PaletteItem[] = [
      { id: 'action:profile', label: 'My profile', context: 'Account', icon: 'heroUser', run: () => this._router.navigateByUrl('/profile') },
      { id: 'action:theme', label: 'Toggle dark mode', context: 'Action', icon: 'heroMoon', run: () => this._theme.toggleTheme() },
      { id: 'action:sidebar', label: 'Show / hide sidebar', context: 'Action · Ctrl+B', icon: 'heroBars3', run: () => this._layout.toggleHidden() },
    ];
    return [...pages, ...actions];
  });

  readonly results = computed(() => {
    const tokens = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    const items = this.allItems();
    if (!tokens.length) return items.slice(0, 50);
    return items.filter((item) => {
      const haystack = `${item.label} ${item.context}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  });

  constructor(
    public palette: CommandPaletteService,
    private _router: Router,
    private _employeeService: EmployeeService,
    private _layout: LayoutService,
    private _theme: ThemeService,
  ) {
    effect(() => {
      if (!this.palette.isOpen()) return;
      this.query.set('');
      this.activeIndex.set(0);
      setTimeout(() => this.queryInput?.nativeElement.focus());
    });
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex.update((i) => (count ? (i + 1) % count : 0));
        break;
      case 'ArrowUp':
        this.activeIndex.update((i) => (count ? (i - 1 + count) % count : 0));
        break;
      case 'Enter':
        this.choose(this.results()[this.activeIndex()]);
        break;
      case 'Escape':
        this.palette.close();
        break;
      default:
        return;
    }
    event.preventDefault();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setTimeout(() => document.getElementById('palette-option-' + this.activeIndex())?.scrollIntoView({ block: 'nearest' }));
    }
  }

  choose(item: PaletteItem | undefined): void {
    if (!item) return;
    this.palette.close();
    item.run();
  }
}
