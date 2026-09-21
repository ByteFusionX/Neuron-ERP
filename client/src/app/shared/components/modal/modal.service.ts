import { ApplicationRef, Injectable, Injector, Type, createComponent, inject } from '@angular/core';
import { ModalContainerComponent } from './modal-container.component';
import { MODAL_DATA, ModalConfig, ModalRef } from './modal-ref';

/**
 * Opens a component in a centered modal on document.body. The component can inject ModalRef and MODAL_DATA.
 *   this.modal.open<Result>(MyFormComponent, { width: '640px', data }).afterClosed().subscribe(...)
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private appRef = inject(ApplicationRef);
  private openCount = 0;
  private prevOverflow = '';

  open<R = unknown, D = unknown>(component: Type<unknown>, config: ModalConfig<D> = {}): ModalRef<R> {
    const ref = new ModalRef<R>();
    const contentInjector = Injector.create({
      parent: this.appRef.injector,
      providers: [
        { provide: MODAL_DATA, useValue: config.data ?? null },
        { provide: ModalRef, useValue: ref },
      ],
    });

    const host = createComponent(ModalContainerComponent, { environmentInjector: this.appRef.injector });
    host.setInput('component', component);
    host.setInput('contentInjector', contentInjector);
    if (config.width) host.setInput('width', config.width);
    if (config.closeOnBackdrop !== undefined) host.setInput('closeOnBackdrop', config.closeOnBackdrop);
    if (config.role) host.setInput('role', config.role);
    if (config.layer) host.setInput('layer', config.layer);

    ref.requestClose = (result) => host.instance.close(result);
    host.instance.closed.subscribe((result) => {
      this.appRef.detachView(host.hostView);
      host.destroy();
      this.unlockScroll();
      ref.notifyClosed(result as R | undefined);
    });

    this.lockScroll();
    document.body.appendChild(host.location.nativeElement);
    this.appRef.attachView(host.hostView);
    return ref;
  }

  private lockScroll(): void {
    if (this.openCount++ === 0) {
      this.prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  }

  private unlockScroll(): void {
    if (--this.openCount === 0) document.body.style.overflow = this.prevOverflow;
  }
}
