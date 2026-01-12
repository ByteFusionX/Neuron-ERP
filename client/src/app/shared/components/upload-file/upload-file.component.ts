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
        const files = event.target.files;
        if (files && files.length > 0) {
            this.handleFiles(files);
            this.resetFileInput();
        }
    }

    handleFiles(files: FileList) {
        if (!files || files.length === 0) {
            return;
        }

        if (!this.selectedFiles) {
            this.selectedFiles = [];
        }

        for (let i = 0; i < files.length; i++) {
            const newFile = files[i];
            const exist = this.selectedFiles.some(file => 
                file.name === newFile.name && 
                file.size === newFile.size && 
                file.lastModified === newFile.lastModified
            );
            if (!exist) {
                this.selectedFiles.push(files[i]);
            }
        }
        this.onUpload();
    }

    resetFileInput() {
        if (this.fileInput?.nativeElement) {
            this.fileInput.nativeElement.value = '';
        }
    }

    onUpload() {
        this.fileUpload.emit(this.selectedFiles);
    }

    validateFile() {
        this.fileError = this.selectedFiles.length === 0;
    }

    onFileRemoved(index: number) {
        if (this.selectedFiles && index >= 0 && index < this.selectedFiles.length) {
            this.selectedFiles.splice(index, 1);
            this.resetFileInput();
            this.onUpload();
        }
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
