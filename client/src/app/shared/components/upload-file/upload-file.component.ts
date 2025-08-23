import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIconsModule } from '@ng-icons/core';
import { appFileValidator } from '../../directives/file-validator.directive';

@Component({
    selector: 'app-upload-file',
    templateUrl: './upload-file.component.html',
    styleUrls: ['./upload-file.component.css'],
    imports: [CommonModule, NgIconsModule, MatTooltipModule],
    providers: [appFileValidator]
})
export class UploadFileComponent {
    @Input() label: string = '';
    @Input() isPadding: boolean = true;
    @Output() fileUpload = new EventEmitter<File[]>();
    @ViewChild('fileInput') fileInput!: ElementRef;
    fileError: boolean = false;
    isDragging: boolean = false;

    @Input() selectedFiles: any[] = [];

    onFileSelected(event: any) {
        let files = event.target.files;
        this.handleFiles(files);
    }

    handleFiles(files: FileList) {
        for (let i = 0; i < files.length; i++) {
            const newFile = files[i];
            const exist = this.selectedFiles.some(file => file.name === newFile.name);
            if (!exist) {
                this.selectedFiles.push(files[i]);
            }
        }
        this.onUpload();
    }

    onUpload() {
        this.fileUpload.emit(this.selectedFiles);
    }

    validateFile() {
        this.fileError = this.selectedFiles.length === 0;
    }

    onFileRemoved(index: number) {
        this.selectedFiles.splice(index, 1);
        this.fileInput.nativeElement.value = '';
        this.onUpload();
    }

    // Drag and drop handlers
    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        if (event.dataTransfer?.files) {
            this.handleFiles(event.dataTransfer.files);
        }
    }

    // Helper method to trigger file input click
    triggerFileInput() {
        this.fileInput.nativeElement.click();
    }
}
