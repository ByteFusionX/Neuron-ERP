import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

export interface TransferEngineerDialogData {
  projectId: string;
  currentEngineer?: { firstName?: string; lastName?: string; _id?: string } | null;
  /** Job id shown as context in the header. */
  jobId?: string;
}

export interface TransferEngineerDialogResult {
  engineerId: string;
}

/** Picks the engineer a project moves to. Closes with the choice, or undefined on cancel. */
@Component({
  selector: 'app-transfer-engineer',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="user" tone="violet" title="Transfer engineer"
      contextLabel="Job" [context]="data?.jobId"
      formId="transfer-engineer-form" [invalid]="form.invalid && submitted"
      submitLabel="Transfer" submitIcon="check" submitShortcutVerb="submit"
      (closed)="close()">
      <form id="transfer-engineer-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Transfer" columns="1">
          @if (currentName) {
            <div class="rounded-lg bg-gray-50 p-3 text-[13px] dark:bg-white/5">
              <span class="block text-xs text-gray-500">Current engineer</span>{{ currentName }}
            </div>
          }
          <app-sf-field label="New engineer" [control]="form.controls.engineerId">
            <app-sf-combobox formControlName="engineerId" [options]="engineerOptions" placeholder="Search engineer"></app-sf-combobox>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class TransferEngineerComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<TransferEngineerDialogResult>>(ModalRef);
  private employeeService = inject(EmployeeService);
  data = inject(MODAL_DATA, { optional: true }) as TransferEngineerDialogData | null;

  submitted = false;
  engineerOptions: SfOption[] = [];
  form = this.fb.group({ engineerId: ['', Validators.required] });

  get currentName(): string {
    const e = this.data?.currentEngineer;
    return e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() : '';
  }

  ngOnInit(): void {
    this.employeeService.getAllEmployees().subscribe((employees: any[]) => {
      const currentId = this.data?.currentEngineer?._id;
      this.engineerOptions = employees
        .filter((e) => e._id !== currentId)
        .map((e) => ({ label: `${e.firstName} ${e.lastName}`.trim(), value: e._id }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close({ engineerId: this.form.getRawValue().engineerId! });
  }
}
