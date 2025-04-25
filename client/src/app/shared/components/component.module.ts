import { NgModule } from '@angular/core';
import { CelebrationDialogComponent } from './celebration-dialog/celebration-dialog.component';
import { ConfettiComponentComponent } from './confetti-component/confetti-component.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { OptionalItemsComponent } from './optional-items/optional-items.component';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NotificationComponent } from './notification/notification.component';



@NgModule({
    imports: [
        ConfettiComponentComponent,
        IconsModule,
        CommonModule,
        NgxExtendedPdfViewerModule,
        NgSelectModule,
        ReactiveFormsModule,
        MatSnackBarModule,
        FormsModule,
        NotificationComponent,
        CelebrationDialogComponent, OptionalItemsComponent
    ],
    exports: [OptionalItemsComponent],
    providers: [],
})
export class componentModule { }
