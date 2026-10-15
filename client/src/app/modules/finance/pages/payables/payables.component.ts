import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { InvoiceRegisterComponent } from 'src/app/modules/invoice/pages/invoice-register/invoice-register.component';

@Component({
  selector: 'app-payables',
  imports: [
    NgIf,
    RouterOutlet,
    InvoiceRegisterComponent,
  ],
  templateUrl: './payables.component.html',
  styleUrl: './payables.component.css',
})
export class PayablesComponent implements OnInit, OnDestroy {
  hasChildRoute = false;

  private readonly sub = new Subscription();

  constructor(private readonly route: ActivatedRoute, private readonly router: Router) { }

  ngOnInit(): void {
    this.syncFromRoute();
    this.sub.add(
      this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe(() => {
        this.syncFromRoute();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private syncFromRoute(): void {
    this.hasChildRoute = !!this.route.firstChild;
  }
}
