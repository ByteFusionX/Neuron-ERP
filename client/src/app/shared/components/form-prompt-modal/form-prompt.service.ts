import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { FormPromptConfig, FormPromptModalComponent, FormPromptResult } from './form-prompt-modal.component';

/** Opens FormPromptModalComponent and resolves with the entered values, or null if cancelled. */
@Injectable({ providedIn: 'root' })
export class FormPromptService {
  constructor(private dialog: MatDialog) {}

  prompt(config: FormPromptConfig): Promise<FormPromptResult | null> {
    const ref = this.dialog.open<FormPromptModalComponent, FormPromptConfig, FormPromptResult | null>(FormPromptModalComponent, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: 'input, textarea, select',
      data: config,
    });
    return firstValueFrom(ref.afterClosed()).then((r) => r ?? null);
  }
}
