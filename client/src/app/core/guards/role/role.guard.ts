import { inject } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, CanActivateFn, NavigationStart, Router, RouterStateSnapshot } from '@angular/router';
import { EmployeeService } from '../../services/employee/employee.service';
import { Observable, filter, map, switchMap, take, of } from 'rxjs';
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
            isSuperAdmin = data.category.role == 'superAdmin'
            privileges = data?.category.privileges;
            
            if (data.isBlocked) {
                localStorage.removeItem('employeeToken');
                toast.error('Your account has been blocked. Please contact your administrator.');
                router.navigate(['/login']);
                return false;
            }
            
            return checkPermission()
        })
    );

    function checkPermission() {
        const url = state.url;

        switch (url) {
            case '/home/employees':
                if (privileges?.employee?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/home/announcements':
                if (privileges?.announcement?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/customers':
                if (privileges?.customer?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/customers/create':
                if (!privileges?.customer?.create) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/enquiry':
                if (privileges?.enquiry?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/assigned-jobs':
                if (privileges?.assignedJob?.viewReport == 'none' || privileges?.assignedJob?.viewReport == 'assigned') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/assigned-jobs/reassigned':
                if (privileges?.assignedJob?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/assigned-jobs/completed':
                if (privileges?.assignedJob?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/quotations':
                if (privileges?.quotation?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/quotations/create':
                // Check the previous URL using router.getCurrentNavigation()
                const previousUrl = router.getCurrentNavigation()?.previousNavigation?.finalUrl?.toString();

                // Allow if coming from your specific route (e.g., '/quotations/view')
                if (previousUrl === '/enquiry') {
                    return true;
                }

                // Otherwise check for permissions as before
                if (!privileges?.quotation?.create) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/job-sheet':
                if (privileges?.jobSheet?.viewReport == 'none') {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/deal-sheet':
                if (privileges?.dealSheet == false) {
                    router.navigate(['/home']);
                    return false;
                }
                break;

            case '/settings':
                if (privileges) {
                    if (!Object.values(privileges.portalManagement).some(value => value === true)) {
                        router.navigate(['/home']);
                        return false;
                    }
                }

                break;

            case '/recycle':
                if (!isSuperAdmin) {
                    router.navigate(['/home']);
                    return false;

                }

                break;

            default:
                if (url.startsWith('/purchase') && !url.startsWith('/purchase-order')) {
                    if (privileges?.purchase?.viewReport == 'none') {
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
                    if (privileges?.supplier?.viewReport == 'none') {
                        router.navigate(['/home']);
                        return false;
                    }
                } else if (url.startsWith('/inventory')) {
                    if (privileges?.inventory?.products?.viewReport == 'none' && privileges?.inventory?.stockEntries?.viewReport == 'none') {
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
                            router.navigate(['/dispatch/delivery-note-register']);
                            return false;
                        }
                    } else if (url.includes('/pending-delivery-reports')) {
                        if (!privileges?.dispatch?.viewPendingDelivery) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else if (url.includes('/invoice-linking-report')) {
                        if (!privileges?.dispatch?.viewInvoiceLinking) {
                            router.navigate(['/home']);
                            return false;
                        }
                    } else if (url.includes('/inventory-deduction-report')) {
                        if (!privileges?.dispatch?.viewInventoryDeduction) {
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

};
