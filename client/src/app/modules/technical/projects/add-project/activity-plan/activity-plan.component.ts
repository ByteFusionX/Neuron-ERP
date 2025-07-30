import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { Project } from 'src/app/shared/interfaces/project.interface';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-activity-plan',
  standalone: true,
  imports: [CommonModule, TableComponent, SelectDropdownComponent, ReactiveFormsModule],
  templateUrl: './activity-plan.component.html',
  styleUrl: './activity-plan.component.css',
})
export class ActivityPlanComponent implements OnInit {
  private technicalService = inject(TechnicalService);
  private fb = inject(FormBuilder);

  activityPlans: Project[] = [];
  columns: TableColumn[] = [];
  showModal = false;
  addForm!: FormGroup;
  isSubmitted = false;
  engineers: any[] = [];
  reasonOptions = [
    { id: 'Delay in material', name: 'Delay in material' },
    { id: 'Resource unavailable', name: 'Resource unavailable' },
    { id: 'Client hold', name: 'Client hold' },
    { id: 'Other', name: 'Other' }
  ];

  get defaultColumns() {
    return this.columns.map(c => c.key);
  }

  ngOnInit() {
    this.columns = [
      { key: 'activityName', label: 'Activity Name', type: 'text', filterable: true, filterType: 'text' },
      { key: 'expectedStartDate', label: 'Expected Start Date', type: 'date', filterable: true, filterType: 'date' },
      { key: 'expectedEndDate', label: 'Expected End Date', type: 'date', filterable: true, filterType: 'date' },
      { key: 'personNames', label: 'Activity Performed Person(s)', type: 'text', filterable: false },
      { key: 'status', label: 'Status', type: 'text', filterable: true, filterType: 'select', filterOptions: [ { label: 'Open', value: 'Open' }, { label: 'Closed', value: 'Closed' } ] },
      { key: 'actualStartDate', label: 'Actual Start Date', type: 'date', filterable: false, visible: false },
      { key: 'actualEndDate', label: 'Actual End Date', type: 'date', filterable: false, visible: false },
      { key: 'reason', label: 'Reason', type: 'text', filterable: false, visible: false },
    ];
    this.loadEngineers();
    this.loadActivityPlans();
    this.addForm = this.fb.group({
      activityName: ['', Validators.required],
      expectedStartDate: ['', Validators.required],
      expectedEndDate: ['', Validators.required],
      personNames: [[], Validators.required],
      status: ['Open', Validators.required],
      actualStartDate: [''],
      actualEndDate: [''],
      reason: ['']
    });
  }

  loadEngineers() {
    this.technicalService.getEngineers().subscribe(res => {
      this.engineers = (res?.data || []).map((e: any) => ({ id: e._id, name: e.firstName + ' ' + e.lastName }));
    });
  }

  loadActivityPlans() {
    this.technicalService.getActivityPlans().subscribe(res => {
      this.activityPlans = res || [];
    });
  }

  openModal() {
    this.showModal = true;
    this.isSubmitted = false;
    this.addForm.reset({ status: 'Open', personNames: [] });
  }

  closeModal() {
    this.showModal = false;
  }

  onSubmit() {
    this.isSubmitted = true;
    if (this.addForm.invalid) return;
    const formValue = this.addForm.value;
    if (formValue.status === 'Closed' && (!formValue.actualStartDate || !formValue.actualEndDate)) return;
    if (formValue.status === 'Closed' && !formValue.reason) return;
    this.technicalService.createActivityPlan(formValue).subscribe(() => {
      this.loadActivityPlans();
      this.closeModal();
    });
  }

  onStatusChange() {
    const status = this.addForm.get('status')?.value;
    if (status === 'Closed') {
      this.addForm.get('actualStartDate')?.setValidators([Validators.required]);
      this.addForm.get('actualEndDate')?.setValidators([Validators.required]);
      this.addForm.get('reason')?.setValidators([Validators.required]);
    } else {
      this.addForm.get('actualStartDate')?.clearValidators();
      this.addForm.get('actualEndDate')?.clearValidators();
      this.addForm.get('reason')?.clearValidators();
    }
    this.addForm.get('actualStartDate')?.updateValueAndValidity();
    this.addForm.get('actualEndDate')?.updateValueAndValidity();
    this.addForm.get('reason')?.updateValueAndValidity();
  }
}
