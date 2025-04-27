import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Directive({
    selector: '[appFileValidator]',
    standalone: false
})
export class appFileValidator {

  @Input() allowedExtensions: string[] = ['.jpg','.jpeg','.png','.pdf','.doc','.docx','.xlsx','.msg','.dwg'];

  constructor(private el: ElementRef, private toast: ToastrService) {}

  @HostListener('change') onChange() {
    const fileInput = this.el.nativeElement;
    const files: File[] = fileInput.files;

    if (!files) return;

    for (const file of files) {
     
      const isValidExtension = this.allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isValidExtension) {
        fileInput.value = '';
        this.toast.warning(' Upload a file with one of these extensions: .jpg, .jpeg, .png, .pdf, .doc, .docx, .xlsx', "Warning");
        return;
      }
    }
  }
}
