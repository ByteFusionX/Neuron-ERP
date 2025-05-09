import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MrRequestComponent } from '../mr-request/mr-request.component';

@Component({
  selector: 'app-create-purchase',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    appNoLeadingSpace,
    ResizableComponent,
    NgSelectComponent,
    NgOptionComponent
  ],
  templateUrl: './create-purchase.component.html',
  styleUrl: './create-purchase.component.css',
})
export class CreatePurchaseComponent implements OnInit {
  private purchaseService = inject(PurchaseService)
  private _dialog = inject(MatDialog)
  private router = inject(Router)

  generatedPRId: string = '';
  prSequence: string = '0001'

  purchaseJobData!: any;
  itemsList: any;



  ngOnInit(): void {
    this.purchaseService.selectedJob$.subscribe((job) => {
      console.log(job)
      this.purchaseJobData = {
        customer: job?.clientDetails.companyName || '',
        jobId: job?.jobId || '',
        deelSheetId: job?.quotation.dealData.dealId || '',
        salesManager: job?.salesPersonDetails[0].firstName + ' ' + job?.salesPersonDetails[0].lastName || '',
      }
    })
    this.generatedPRId = this.generateId()
  }

  generateId(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // last two digits of year
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // zero-padded month
    return `NRN/PR-${year}-${month}-${this.prSequence}`;
  }

  onSupplierClicks() {
    this.router.navigate(['/purchase/supplier-discount'])
  }

  onMrRequestClicks() {
    this._dialog.open(MrRequestComponent, {
      width: '550px'
    })
  }
}
