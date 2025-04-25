import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Directive({ selector: '[appFileSizeValidator]' })
export class appFileSizeValidator {

  @Input() maxSize: number = 5;

  constructor(private el: ElementRef, private toast: ToastrService) {}

  @HostListener('change') onChange() {
    const fileInput = this.el.nativeElement;
    const files: File[] = fileInput.files;

    if (!files) return;

    for (const file of files) {
      const fileSizeInMB = file.size / (1024 * 1024);

      if (fileSizeInMB > this.maxSize) {
        fileInput.value = '';
        this.toast.warning(' The attachment size should be less than 5MB.', "Warning");
        return;
      }

      
    }
  }
}
