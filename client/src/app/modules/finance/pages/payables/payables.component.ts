import { NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { CancelledInvoicesComponent } from 'src/app/modules/invoice/pages/cancelled-invoices/cancelled-invoices.component';
import { CancelledReissuedReportComponent } from 'src/app/modules/invoice/pages/cancelled-reissued-report/cancelled-reissued-report.component';
import { InvoiceDnLinkingComponent } from 'src/app/modules/invoice/pages/invoice-dn-linking/invoice-dn-linking.component';
import { InvoiceRegisterComponent } from 'src/app/modules/invoice/pages/invoice-register/invoice-register.component';

type PayablesTab = 'invoice-register' | 'invoice-dn-linking' | 'cancelled-invoices' | 'reissued';

@Component({
  selector: 'app-payables',
  imports: [
    NgIf,
    NgFor,
    NgSwitch,
    NgSwitchCase,
    RouterOutlet,
    InvoiceRegisterComponent,
    InvoiceDnLinkingComponent,
    CancelledInvoicesComponent,
    CancelledReissuedReportComponent,
  ],
  templateUrl: './payables.component.html',
  styleUrl: './payables.component.css',
})
export class PayablesComponent implements OnInit, OnDestroy {
  readonly tabs: { id: PayablesTab; label: string }[] = [
    { id: 'invoice-register', label: 'Invoices' },
    { id: 'invoice-dn-linking', label: 'Invoice vs DN' },
    { id: 'cancelled-invoices', label: 'Cancelled/Adjusted' },
    { id: 'reissued', label: 'Reissued' },
  ];

  activeTab: PayablesTab = 'invoice-register';
  hasChildRoute = false;

  private readonly sub = new Subscription();

  constructor(private readonly route: ActivatedRoute, private readonly router: Router) {}

  ngOnInit(): void {
    this.syncFromRoute();
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const tab = params.get('tab') as PayablesTab | null;
        if (tab && this.tabs.some((t) => t.id === tab)) this.activeTab = tab;
      })
    );
    this.sub.add(
      this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe(() => {
        this.syncFromRoute();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  selectTab(tab: PayablesTab): void {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private syncFromRoute(): void {
    this.hasChildRoute = !!this.route.firstChild;
    const tab = this.route.snapshot.queryParamMap.get('tab') as PayablesTab | null;
    if (tab && this.tabs.some((t) => t.id === tab)) this.activeTab = tab;
  }
}
