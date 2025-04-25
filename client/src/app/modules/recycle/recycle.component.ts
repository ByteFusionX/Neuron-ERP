import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { RecycleService, Trash } from 'src/app/core/services/recycle/recycle.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault, DatePipe } from '@angular/common';
import { SkeltonLoadingComponent } from '../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'app-recycle',
    templateUrl: './recycle.component.html',
    styleUrls: ['./recycle.component.css'],
    imports: [NgIf, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, NgSwitch, NgSwitchCase, NgSwitchDefault, MatTooltip, NgIcon, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, DatePipe]
})
export class RecycleComponent implements OnInit, OnDestroy {

  dataSource: any = new MatTableDataSource<Trash>()
  displayedColumns: string[] = ['from', 'data', 'date', 'employee', 'action'];
  isLoading: boolean = true;
  isEmpty: boolean = false;

  private subscriptions = new Subscription()

  constructor(private recycleServices: RecycleService, public dialog: MatDialog, private _toast: ToastrService) { }

  ngOnInit(): void {
    this.subscriptions.add(
      this.recycleServices.fetchTrash().subscribe((data) => {
        if (data) {
          this.isLoading = false
          this.dataSource.data = data;
          this.isEmptyCheck()
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  isEmptyCheck() {
    if (this.dataSource.data.length == 0) {
      this.isEmpty = true
    }
  }

  onRestoreClicks(from: string, dataId: string, index: number) {
    const trash = this.dataSource.data[index]
    if (trash) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: `Restore ${from}`,
          description: `Are you sure you want to restore "${from}"?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });
      
      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.subscriptions.add(
            this.recycleServices.restoreTrash({ from, dataId }).subscribe({
              next: (res) => {
                this.dataSource.data.splice(index, 1)
                this.dataSource.data = [...this.dataSource.data]
                this._toast.success(res.message);
                this.isEmptyCheck()
              },
              error: (error) => {
                this._toast.error(error.error.message || 'Failed to retore');
              }
            })
          )
        }
      });
    }
  }

}
