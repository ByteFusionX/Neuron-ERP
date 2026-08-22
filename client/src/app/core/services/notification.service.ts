import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subject, switchMap, take } from 'rxjs';
import { Socket } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { TextNotification } from 'src/app/shared/interfaces/notification.interface';
import { EmployeeService } from './employee/employee.service';
import { Router, NavigationExtras } from '@angular/router';
import { SameRouteNavigationService } from './same-route-navigation.service';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    textNotificationsSubject = new BehaviorSubject<{ viewed: TextNotification[], unviewed: TextNotification[] }>({ viewed: [], unviewed: [] });
    textNotificationsSubject$ = this.textNotificationsSubject.asObservable();
    api: string = environment.api

    constructor(
        private http: HttpClient,
        private socket: Socket,
        private employeeService: EmployeeService,
        private router: Router,
        private sameRouteNavigation: SameRouteNavigationService
    ) { }

    private calculateRoutePath(notification: any): { routePath: string; routeData?: any } {
        const type = notification.type;
        const referenceId = notification.referenceId;
        const additionalData = notification.additionalData;

        switch (type) {
            case 'Announcement':
                return { routePath: '/announcements' };
            
            case 'AssignedJob':
                return { routePath: '/assigned-jobs' };
            case 'ReAssignedJob':
                return { routePath: '/assigned-jobs/reassigned' };

            case 'FeedbackRequest':
            case 'Enquiry':
                const enquiryId = additionalData?.enquiryId || referenceId?._id?.toString() || referenceId?.toString();
                return { 
                    routePath: '/enquiry',
                    routeData: { enquiryId }
                };
            
            case 'DealSheet':
                return { routePath: '/deal-sheet/pendings' };
            case 'DealSheetResponse':
                return { routePath: '/quotations' };
            case 'Quotation':
                return {
                    routePath: '/quotations/view',
                    routeData: referenceId
                };

            case 'JobAllocated':
                const jobId = additionalData?.jobId || referenceId?._id?.toString();
                return {
                    routePath: '/purchase/create',
                    routeData: { jobId }
                };

            case 'ProcurementTransferred':
                const transferredJobId = additionalData?.jobId || referenceId?._id?.toString() || referenceId?.toString();
                return {
                    routePath: '/purchase/create',
                    routeData: { jobId: transferredJobId }
                };

            case 'MrRequest':
                const technicalId = additionalData?.technicalId;
                if (technicalId) {
                    return {
                        routePath: '/technical/project/material-request',
                        routeData: { technicalId }
                    };
                }
                return { routePath: '/technical/project' };
            case 'MrApprovalRequest':
                const approvalTechnicalId = additionalData?.technicalId || referenceId?._id?.toString();
                return {
                    routePath: '/technical/mr-approval-requests/view',
                    routeData: { technicalId: approvalTechnicalId }
                };
            case 'MrRejected':
                const rejectedTechnicalId = additionalData?.technicalId || referenceId?._id?.toString();
                return {
                    routePath: '/technical/project/material-request',
                    routeData: { technicalId: rejectedTechnicalId }
                };
            case 'MrApproved':
                const approvedJobId = additionalData?.jobId;
                return {
                    routePath: '/purchase/create',
                    routeData: { jobId: approvedJobId }
                };
            case 'TechnicalAssigned':
                const projectId = additionalData?.projectId || referenceId?._id?.toString();
                return {
                    routePath: '/technical/project/edit',
                    routeData: { projectId }
                };
            case 'PurchaseApprovalRequest':
                const approvalPurchaseId = additionalData?.purchaseId || referenceId?._id?.toString();
                return {
                    routePath: '/purchase/view-purchase',
                    routeData: { purchaseId: approvalPurchaseId }
                };
            case 'PurchaseProcurementNotice':
                const procurementNoticePurchaseId = additionalData?.purchaseId || referenceId?._id?.toString();
                return {
                    routePath: '/purchase/view-purchase',
                    routeData: { purchaseId: procurementNoticePurchaseId }
                };
            case 'PurchaseApproved':
                const approvedPurchaseId = additionalData?.purchaseId || referenceId?._id?.toString();
                return {
                    routePath: '/purchase/initiate-lpo',
                    routeData: { purchaseId: approvedPurchaseId }
                };
            case 'PurchaseRejected':
                const rejectedPurchaseId = additionalData?.purchaseId || referenceId?._id?.toString();
                return {
                    routePath: '/purchase/view-purchase',
                    routeData: { purchaseId: rejectedPurchaseId }
                };
            case 'LpoApprovalRequest':
                return { routePath: '/purchase-order/pending-approval' };
            case 'LpoApproved':
            case 'LpoRejected':
                const lpoPurchaseId = additionalData?.purchaseId || referenceId?.purchaseId?.toString?.();
                return {
                    routePath: '/purchase/initiate-lpo',
                    routeData: { purchaseId: lpoPurchaseId }
                };
            case 'SupplierApprovalRequest':
            case 'SupplierApproved':
            case 'SupplierRejected':
                const supplierId = additionalData?.supplierId || referenceId?._id?.toString?.() || referenceId?.toString?.();
                return {
                    routePath: '/suppliers',
                    routeData: { supplierId }
                };
            case 'ClaimApprovalRequest':
                return { routePath: '/claims/approval-requests' };
            case 'ClaimApproved':
            case 'ClaimRejected':
                const claimTechnicalId = additionalData?.technicalId || referenceId?.technicalId?.toString?.();
                if (claimTechnicalId) {
                    return {
                        routePath: '/technical/project/claims',
                        routeData: { technicalId: claimTechnicalId }
                    };
                }
                return { routePath: '/claims/my-claims' };
            
            case 'Event':
                if (referenceId?.collectionId) {
                    const from = referenceId.from;
                    if (from === 'Enquiry') {
                        return {
                            routePath: '/enquiry',
                            routeData: { enquiryId: referenceId.collectionId._id?.toString() || referenceId.collectionId.toString() }
                        };
                    } else if (from === 'Quotation') {
                        return {
                            routePath: '/quotations/view',
                            routeData: referenceId.collectionId
                        };
                    }
                }
                return { routePath: '/home' };
            
            default:
                return { routePath: '/home' };
        }
    }

    initializeNotifications() {
        console.log('initializeNotifications');
        this.socket.fromEvent('recieveNotifications').subscribe(
            {
                next: (notification) => {
                    console.log('notification', notification);
                    const routeInfo = this.calculateRoutePath(notification);
                    const notificationWithRoute = {
                        ...notification,
                        routePath: routeInfo.routePath,
                        routeData: routeInfo.routeData
                    };
                    const notifications = this.textNotificationsSubject.value
                    notifications.unviewed.unshift(notificationWithRoute)
                    this.textNotificationsSubject.next(notifications)
                },
                error: (error) => {
                    console.error('Error receiving notifications:', error);
                }
            }
        );
    }


    getEmployeeTextNotifications() {
        this.http.get<{ viewed: TextNotification[], unviewed: TextNotification[] }>(`${this.api}/notification`).subscribe({
            next: (data) => this.textNotificationsSubject.next(data),
            error: (error) => console.error('Error fetching notifications:', error)
        })
    }

    authSocketIo(token: string) {
        this.socket.emit('auth', token);
    }


    markAsRead(notificationId?: string): Observable<any> {
        return this.employeeService.employeeData$.pipe(
            take(1),
            switchMap(employeeData => {
                if (employeeData) {
                    const recipientId = employeeData._id;
                    return this.http.patch(`${this.api}/notification/mark-as-read`, { notificationId, recipientId });
                } else {
                    throw new Error('Employee data not found');
                }
            })
        );
    }

    private resolveNotificationNavigation(
        routePath: string,
        routeData?: any
    ): { commands: any[]; extras?: NavigationExtras } | null {
        if (routePath === '/quotations/view' && routeData) {
            return {
                commands: [routePath],
                extras: { state: routeData },
            };
        }
        if (routePath === '/enquiry' && routeData?.enquiryId) {
            return {
                commands: [routePath],
                extras: { queryParams: { enquiryId: routeData.enquiryId } },
            };
        }
        if (routePath === '/purchase/create' && routeData?.jobId) {
            return {
                commands: [routePath],
                extras: { queryParams: { jobId: routeData.jobId } },
            };
        }
        if (routePath === '/purchase/view-purchase' && routeData?.purchaseId) {
            return { commands: [routePath, routeData.purchaseId] };
        }
        if (routePath === '/purchase/initiate-lpo' && routeData?.purchaseId) {
            return { commands: [routePath, routeData.purchaseId] };
        }
        if (routePath === '/purchase-order/pending-approval') {
            return { commands: [routePath] };
        }
        if (routePath === '/technical/mr-approval-requests/view' && routeData?.technicalId) {
            return { commands: [routePath, routeData.technicalId] };
        }
        if (routePath === '/technical/project/edit' && routeData?.projectId) {
            return { commands: [routePath, routeData.projectId] };
        }
        if (routePath === '/technical/project/material-request' && routeData?.technicalId) {
            return { commands: [routePath, routeData.technicalId] };
        }
        if (routePath === '/suppliers' && routeData?.supplierId) {
            return { commands: [routePath, routeData.supplierId] };
        }
        if (routePath === '/claims/approval-requests') {
            return { commands: [routePath] };
        }
        if (routePath === '/technical/project/claims' && routeData?.technicalId) {
            return { commands: [routePath, routeData.technicalId] };
        }
        if (routePath === '/claims/my-claims') {
            return { commands: [routePath] };
        }
        if (routePath && routePath.trim() !== '') {
            return { commands: [routePath] };
        }
        return null;
    }

    private normalizeUrlForCompare(url: string): string {
        const base = (url || '/').split('#')[0];
        return base.startsWith('/') ? base : `/${base}`;
    }

    private isSameRouterTarget(
        commands: any[],
        extras?: NavigationExtras
    ): boolean {
        try {
            const tree = this.router.createUrlTree(commands, extras);
            const target = this.normalizeUrlForCompare(this.router.serializeUrl(tree));
            const current = this.normalizeUrlForCompare(this.router.url);
            return target === current;
        } catch {
            return false;
        }
    }

    navigateToNotification(notification: TextNotification): void {
        let routePath = notification.routePath;
        let routeData = notification.routeData;

        if (!routePath) {
            const routeInfo = this.calculateRoutePath(notification);
            routePath = routeInfo.routePath;
            routeData = routeInfo.routeData;
        }

        if (!routePath || routePath.trim() === '') {
            return;
        }

        const target = this.resolveNotificationNavigation(routePath, routeData);
        if (!target?.commands?.length) {
            return;
        }

        const { commands, extras } = target;
        if (this.isSameRouterTarget(commands, extras)) {
            this.sameRouteNavigation.beginSameUrlTargetReload();
        }

        this.router
            .navigate(commands, {
                ...(extras || {}),
                onSameUrlNavigation: 'reload',
            })
            .finally(() => {
                this.sameRouteNavigation.endSameUrlNavigationCycle();
            });
    }
}


