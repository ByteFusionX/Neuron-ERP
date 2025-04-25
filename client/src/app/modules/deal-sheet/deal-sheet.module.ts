import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DealSheetComponent } from './deal-sheet.component';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule } from '@angular/material/dialog';
import { PaginationComponent } from 'src/app/shared/components/pagination/pagination.component';
import { DealSheetRoutingModule } from './deal-sheet-routing.module';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApproveDealComponent } from './approve-deal/approve-deal.component';
import { pipeModule } from "../../shared/pipes/pipe.module";
import { RejectDealComponent } from './reject-deal/reject-deal.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UpdatedealsheetComponent } from './updatedealsheet-component/updatedealsheet-component.component';
import { ApprovedDealsComponent } from './approved-deals/approved-deals.component';
import { PendingDealsComponent } from './pending-deals/pending-deals.component';
import { MatProgressBarModule } from '@angular/material/progress-bar';



@NgModule({
  declarations: [
    DealSheetComponent,
    RejectDealComponent,
    UpdatedealsheetComponent,
    ApprovedDealsComponent,
    PendingDealsComponent,
  ],
  imports: [
    CommonModule,
    DealSheetRoutingModule,
    SkeltonLoadingComponent,
    MatTableModule,
    MatDialogModule,
    PaginationComponent,
    IconsModule,
    MatTooltipModule,
    pipeModule,
    ReactiveFormsModule,
    FormsModule,
    MatProgressBarModule,
    ReactiveFormsModule,
    FormsModule,
    ApproveDealComponent
]
})
export class DealSheetModule { }
