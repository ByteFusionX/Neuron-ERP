import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription, filter, switchMap, take } from 'rxjs';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { MaterialRequestDrawerComponent } from '../material-request-drawer/material-request-drawer.component';

/**
 * Create / edit project slide-over. The host binds `open` and reacts to `saved` / `closed`.
 * Pass `projectId` to edit that project; leave it empty to create one.
 */
@Component({
  selector: 'app-create-project',
  standalone: true,
  templateUrl: './create-project.component.html',
  imports: [ReactiveFormsModule, SmartFormModule, ActionButtonComponent, MaterialRequestDrawerComponent],
})
export class CreateProjectComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  /** When set, the drawer edits this project instead of creating one. */
  @Input() projectId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  saving = false;
  loadingProject = false;
  customerOptions: SfOption[] = [];
  engineerOptions: SfOption[] = [];
  supervisorOptions: SfOption[] = [];
  readonly projectTypeOptions: SfOption[] = [
    { label: 'Project', value: 'project' },
    { label: 'AMC', value: 'amc' },
  ];
  readonly priorityOptions: SfOption[] = ['High', 'Medium', 'Low'].map((label) => ({ label, value: label }));
  readonly statusOptions: SfOption[] = ['Pending', 'Approved', 'Rejected'].map((label) => ({ label, value: label }));

  /** Read-only context shown at the top in edit mode. */
  editInfo: { jobId: string; customer: string; projectType: string; assignedTo: string; assignedBy: string } | null = null;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toaster = inject(ToastrService);
  private technicalService = inject(TechnicalService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private optionsLoaded = false;
  private supervisorsLoaded = false;
  private subscriptions = new Subscription();
  private loadSub?: Subscription;
  /** Estimation rows other than manpower are passed through untouched on save. */
  private otherEstimations: { type: string; value: any }[] = [];
  private existingJobId = '';

  projectForm = this.fb.group({
    customerId: [null as string | null, Validators.required],
    projectType: [null as string | null, Validators.required],
    engineerId: [null as string | null, Validators.required],
    priority: ['Medium' as string | null, Validators.required],
    estimatedCost: [null as number | null, [Validators.min(0)]],
    comment: [''],
    // edit-only
    status: ['Pending' as string | null],
    manpowerCost: [null as number | null, [Validators.min(0)]],
    supervisors: [[] as string[]],
    notes: [''],
    involvedPersons: this.fb.array<any>([]),
  });

  get isEdit(): boolean {
    return !!this.projectId;
  }

  get personsArray(): FormArray {
    return this.projectForm.controls.involvedPersons as unknown as FormArray;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] && !changes['projectId']) return;
    if (!this.open) return;
    if (this.isEdit) {
      this.setMode(true);
      this.ensureSupervisors();
      this.loadProject();
    } else {
      this.setMode(false);
      this.ensureOptions();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  /** Create needs customer + engineer; edit does not, so toggle their validators. */
  private setMode(edit: boolean): void {
    const c = this.projectForm.controls;
    for (const ctrl of [c.customerId, c.projectType, c.engineerId]) {
      if (edit) ctrl.clearValidators(); else ctrl.addValidators(Validators.required);
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
    c.status.setValidators(edit ? Validators.required : null);
    c.status.updateValueAndValidity({ emitEvent: false });
  }

  private personGroup(name = '', designation = '') {
    return this.fb.group({ name: [name], designation: [designation] });
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
          this.engineerOptions = (res.data || []).map((e: any) => ({ label: `${e.firstName} ${e.lastName}`.trim(), value: e._id }))
            .sort((a: SfOption, b: SfOption) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        },
        error: () => this.toaster.error('Failed to load engineers'),
      })
    );
  }

  private ensureSupervisors(): void {
    if (this.supervisorsLoaded) return;
    this.supervisorsLoaded = true;
    this.subscriptions.add(
      this.employeeService.getAllEmployees().subscribe({
        next: (employees) => {
          this.supervisorOptions = employees
            .map((e: any) => ({ label: `${e.firstName} ${e.lastName}`.trim(), value: e._id }))
            .sort((a: SfOption, b: SfOption) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        },
        error: () => this.toaster.error('Failed to load employees'),
      })
    );
  }

  private loadProject(): void {
    this.loadSub?.unsubscribe();
    this.loadingProject = true;
    this.loadSub = this.technicalService.getTechnicalProjectById(this.projectId as string).subscribe({
      next: (res) => {
        const p: any = res.data;
        this.loadingProject = false;
        const name = (u: any) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.fullName || '' : '');
        this.existingJobId = p.jobId?._id || '';
        this.editInfo = {
          jobId: p.jobId?.jobId || '',
          customer: p.customer?.companyName || '',
          projectType: p.projectType === 'amc' ? 'AMC' : 'Project',
          assignedTo: name(p.assignedTo),
          assignedBy: name(p.assignedBy),
        };
        const estimations: { type: string; value: any }[] = Array.isArray(p.estimations) ? p.estimations : [];
        const manpower = estimations.find((e) => e.type === 'manpower');
        this.otherEstimations = estimations.filter((e) => e.type !== 'manpower');

        this.personsArray.clear();
        (Array.isArray(p.involvedPersons) ? p.involvedPersons : []).forEach((x: any) => this.personsArray.push(this.personGroup(x.name, x.designation)));

        this.projectForm.patchValue({
          status: p.status || 'Pending',
          priority: p.priority || 'Medium',
          estimatedCost: p.estimatedCostForProject != null ? Number(p.estimatedCostForProject) || 0 : null,
          manpowerCost: manpower ? Number(manpower.value) || 0 : null,
          supervisors: (p.supervisors || []).map((s: any) => (typeof s === 'string' ? s : s?._id)).filter(Boolean),
          notes: p.notes || '',
        });
        this.projectForm.markAsPristine();
      },
      error: () => {
        this.loadingProject = false;
        this.toaster.error('Failed to fetch project details');
        this.closed.emit();
      },
    });
  }

  addPerson(): void {
    this.personsArray.push(this.personGroup());
    this.projectForm.markAsDirty();
  }

  removePerson(index: number): void {
    this.personsArray.removeAt(index);
    this.projectForm.markAsDirty();
  }

  /** The tasks, issues, activity plan and billing pages still live on the full project page. */
  openWorkspace(): void {
    const id = this.projectId;
    this.projectForm.markAsPristine();
    this.drawer?.requestClose();
    if (id) this.router.navigate(['/technical/project', 'edit', id]);
  }

  materialOpen = false;

  /** Opens the material request drawer on top of this one. */
  openMaterialRequest(): void {
    this.materialOpen = true;
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
    if (this.isEdit) {
      this.submitEdit();
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

  private submitEdit(): void {
    const v = this.projectForm.getRawValue();
    const persons = (v.involvedPersons as { name: string; designation: string }[])
      .map((p) => ({ name: (p.name || '').trim(), designation: (p.designation || '').trim() }))
      .filter((p) => p.name || p.designation);
    this.saving = true;
    this.subscriptions.add(
      this.technicalService.updateTechnicalProject(this.projectId as string, {
        status: v.status as string,
        priority: v.priority as string,
        supervisors: v.supervisors ?? [],
        notes: (v.notes || '').trim(),
        involvedPersons: persons,
        estimations: [{ type: 'manpower', value: String(v.manpowerCost ?? 0) }, ...this.otherEstimations.map((e) => ({ type: e.type, value: String(e.value) }))],
        jobId: this.existingJobId,
        estimatedCostForProject: v.estimatedCost ?? 0,
      }).subscribe({
        next: () => {
          this.saving = false;
          this.toaster.success('Project updated successfully');
          this.reset();
          this.saved.emit();
        },
        error: () => {
          this.saving = false;
          this.toaster.error('Failed to update project');
        },
      })
    );
  }

  private reset(): void {
    this.personsArray.clear();
    this.otherEstimations = [];
    this.editInfo = null;
    this.projectForm.reset({
      customerId: null, projectType: null, engineerId: null, priority: 'Medium', estimatedCost: null, comment: '',
      status: 'Pending', manpowerCost: null, supervisors: [], notes: '',
    });
  }
}
