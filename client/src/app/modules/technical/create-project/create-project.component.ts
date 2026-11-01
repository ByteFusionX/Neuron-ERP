import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, filter, switchMap, take } from 'rxjs';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/** Create-project slide-over. The host binds `open` and reacts to `saved` / `closed`. */
@Component({
  selector: 'app-create-project',
  standalone: true,
  templateUrl: './create-project.component.html',
  imports: [ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class CreateProjectComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  saving = false;
  customerOptions: SfOption[] = [];
  engineerOptions: SfOption[] = [];
  readonly projectTypeOptions: SfOption[] = [
    { label: 'Project', value: 'project' },
    { label: 'AMC', value: 'amc' },
  ];
  readonly priorityOptions: SfOption[] = ['High', 'Medium', 'Low'].map((label) => ({ label, value: label }));

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private technicalService = inject(TechnicalService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private optionsLoaded = false;
  private subscriptions = new Subscription();

  projectForm = this.fb.group({
    customerId: [null as string | null, Validators.required],
    projectType: [null as string | null, Validators.required],
    engineerId: [null as string | null, Validators.required],
    priority: ['Medium' as string | null, Validators.required],
    estimatedCost: [null as number | null, [Validators.min(0)]],
    comment: [''],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) this.ensureOptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.subscriptions.add(
      this.employeeService.employeeData$.pipe(
        filter((e) => !!e?._id),
        take(1),
        switchMap((e) => this.customerService.getAllCustomers(e!._id as string)),
      ).subscribe({
        next: (customers) => {
          this.customerOptions = customers.map((c) => ({ label: c.companyName, value: c._id }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        },
        error: () => this.toaster.error('Failed to load customers'),
      })
    );
    this.subscriptions.add(
      this.technicalService.getEngineers().subscribe({
        next: (res) => {
          this.engineerOptions = (res.data || []).map((e: any) => ({ label: `${e.firstName} ${e.lastName}`.trim(), value: e._id }));
        },
        error: () => this.toaster.error('Failed to load engineers'),
      })
    );
  }

  onDrawerClosed(discarded: boolean): void {
    if (discarded) this.reset();
    this.closed.emit();
  }

  /** Goes through the drawer so unsaved changes get the same discard prompt as X and Esc. */
  cancel(): void {
    this.drawer?.requestClose();
  }

  submit(): void {
    if (this.saving) return;
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      this.toaster.warning('Complete the highlighted required fields.', 'Complete required information');
      return;
    }
    const v = this.projectForm.getRawValue();
    this.saving = true;
    this.subscriptions.add(
      this.technicalService.createProject({
        jobId: '',
        engineerId: v.engineerId as string,
        comment: (v.comment || '').trim(),
        projectType: v.projectType as string,
        customerId: v.customerId as string,
        priority: v.priority as string,
        estimatedCostForProject: v.estimatedCost ?? 0,
      }).subscribe({
        next: () => {
          this.saving = false;
          this.toaster.success('Project created successfully');
          this.reset();
          this.saved.emit();
        },
        error: () => {
          this.saving = false;
          this.toaster.error('Failed to create project');
        },
      })
    );
  }

  private reset(): void {
    this.projectForm.reset({ customerId: null, projectType: null, engineerId: null, priority: 'Medium', estimatedCost: null, comment: '' });
  }
}
