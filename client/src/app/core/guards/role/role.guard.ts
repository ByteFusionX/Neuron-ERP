import { inject } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, CanActivateFn, NavigationStart, Router, RouterStateSnapshot } from '@angular/router';
import { EmployeeService } from '../../services/employee/employee.service';
import { Observable, catchError, filter, map, switchMap, take, of } from 'rxjs';
import { Privileges, getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ToastrService } from 'ngx-toastr';

export const RoleGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    let privileges: Privileges | undefined;
    let isSuperAdmin: boolean;

    const router: Router = inject(Router);
    const toast: ToastrService = inject(ToastrService);
    const employeeService = inject(EmployeeService)

    return employeeService.employeeData$.pipe(
        take(1),
        switchMap((cached) => cached ? of(cached) : employeeService.getEmployee()),
        map((data) => {
            employeeService.employeeSubject.next(data);
            isSuperAdmin = /^superadmin$/i.test(data.category.role ?? '')
            privileges = data?.category.privileges;
            
            if (data.isBlocked) {
                localStorage.removeItem('employeeToken');
                toast.error('Your account has been blocked. Please contact your administrator.');
                router.navigate(['/login']);
                return false;
            }
            
            if (isSuperAdmin) return true;
            return checkPermission()
        }),
        // API unreachable: the interceptor already shows the connection toast. Stay where we are instead of
        // letting the failed navigation drop the user out of their session.
        catchError(() => of(false))
    );

    function checkPermission() {
        const url = state.url;

        switch (url) {
            case '/hr/employees':
                if (!canViewEmployees()) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/hr/departments':
            case '/hr/departments/overview':
                if (!isSuperAdmin && !privileges?.departments?.view) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/announcements':
                if (!hasView(privileges?.announcement?.viewReport)) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/customers':
                if (!hasView(privileges?.customer?.viewReport)) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/enquiry':
                if (!hasView(privileges?.enquiry?.viewReport)) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/presales':
                if (privileges?.assignedJob?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/quotations':
                if (!canViewQuotations()) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/job-sheet':
                if (!hasView(privileges?.jobSheet?.viewReport)) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/deal-sheet':
                if (!canViewDealSheet()) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/recycle':
                if (!isSuperAdmin && !privileges?.portalManagement?.recycle) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/bug-reports':
                if (!isSuperAdmin && !privileges?.portalManagement?.bugReports) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/settings':
                if (!canViewSettings()) {
                    router.navigate(['/home']);
                    return false;
                }

                break;

            default:
                if (url.startsWith('/hr')) {
                    if (!canViewEmployees()) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/settings')) {
                    if (!canViewSettings()) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/quotations')) {
                    if (!canViewQuotations()) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/deal-sheet')) {
                    if (!canViewDealSheet()) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/purchase') && !url.startsWith('/purchase-order')) {
                    if (!hasView(privileges?.purchase?.viewReport)) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/grn')) {
                    if (!privileges?.grn?.viewReport || privileges?.grn?.viewReport == 'none') {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/purchase-order')) {
                    if (!privileges?.purchaseOrder?.viewReport || privileges?.purchaseOrder?.viewReport == 'none') {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/technical')) {
                    if (privileges?.technical?.viewReport == 'none' && !privileges?.technical?.canViewOpenToWorkAndAssign && 
                        !privileges?.technical?.canTransferToEngineer && !privileges?.technical?.canApproveMRRequests) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/suppliers')) {
                    if (!hasView(privileges?.supplier?.viewReport)) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/products')) {
                    if (!hasView(privileges?.inventory?.products?.viewReport)) {
                        toast.warning("You don't have access to Products. Ask an administrator if you need it.");
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/stock')) {
                    if (!hasView(privileges?.inventory?.stockEntries?.viewReport)) {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/claims')) {
                    if (url.includes('/approval-requests')) {
                        if (!privileges?.claims?.canApprove) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else {
                        if (privileges?.claims?.viewReport == 'none' || privileges?.claims?.viewReport == undefined) {
                            router.navigate(['/home']);
                            return false;
                        }
                    }
                } else if (url.startsWith('/dispatch')) {
                    if (url.includes('/create') || url.includes('/edit')) {
                        if (!privileges?.dispatch?.createDeliveryNote) {
                            router.navigate(['/dispatch']);
                            return false;
                        }
                    } else if (url.includes('/pending-delivery-reports')) {
                        if (!privileges?.dispatch?.viewPendingDelivery) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else {
                        // General dispatch view report check
                        if (privileges?.dispatch?.viewReport == 'none' || privileges?.dispatch?.viewReport == undefined) {
                            router.navigate(['/home']);
                            return false;
                        }
                    }
                } else if (url.startsWith('/invoice')) {
                    if (url.includes('/create') || url.includes('/edit') || url.includes('/reissue/')) {
                        if (!privileges?.invoice?.createInvoice) {
                            router.navigate(['/invoice/invoice-register']);
                            return false;
                        }
                    } else if (url.includes('/invoice-dn-linking')) {
                        if (!privileges?.invoice?.viewInvoicesVsDn) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else if (url.includes('/cancelled-invoices')) {
                        if (!privileges?.invoice?.viewCancelledAdjusted) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else if (url.includes('/reissued')) {
                        if (!privileges?.invoice?.viewReissued) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else {
                        // General invoice view check
                        if (privileges?.invoice?.viewReport == 'none' || privileges?.invoice?.viewReport == undefined) {
                            router.navigate(['/home']);
                            return false;
                        }
                    }
                }
                break;
        }
        if (!privileges) {
            // router.navigate(['/home']);
            return false;
        }
        return true;
    }

    // A missing view level (role saved before the flag existed) means no access, same as 'none'.
    function hasView(level?: string): boolean {
        return !!level && level !== 'none';
    }

    function canViewEmployees(): boolean {
        return hasView(privileges?.employee?.viewReport);
    }

    function canViewQuotations(): boolean {
        return hasView(privileges?.quotation?.viewReport);
    }

    function canViewDealSheet(): boolean {
        const dealSheet = privileges?.dealSheet;
        return typeof dealSheet === 'object' && dealSheet !== null ? hasView(dealSheet.viewReport) : dealSheet !== false;
    }

    function canViewSettings(): boolean {
        if (isSuperAdmin) return true;
        if (privileges?.roles?.view) return true;
        const { recycle, bugReports, ...settingsFlags } = privileges?.portalManagement ?? {};
        return Object.values(settingsFlags).some(value => value === true);
    }

};
