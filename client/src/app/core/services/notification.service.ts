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

    private readonly markedUnreadStorageKey = 'markedUnreadNotificationIds';
    markedUnreadIdsSubject = new BehaviorSubject<Set<string>>(this.loadMarkedUnreadIds());
    markedUnreadIds$ = this.markedUnreadIdsSubject.asObservable();

    constructor(
        private http: HttpClient,
        private socket: Socket,
        private employeeService: EmployeeService,
        private router: Router,
        private sameRouteNavigation: SameRouteNavigationService
    ) { }

    private loadMarkedUnreadIds(): Set<string> {
        try {
            const raw = localStorage.getItem(this.markedUnreadStorageKey);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch {
            return new Set();
        }
    }

    private persistMarkedUnreadIds(ids: Set<string>): void {
        try {
            localStorage.setItem(this.markedUnreadStorageKey, JSON.stringify(Array.from(ids)));
        } catch {
            // ignore storage errors
        }
    }

    isMarkedUnread(notificationId?: string): boolean {
        return !!notificationId && this.markedUnreadIdsSubject.value.has(notificationId);
    }

    markAsUnread(notificationId?: string): void {
        if (!notificationId) {
            return;
        }
        const ids = this.markedUnreadIdsSubject.value;
        if (ids.has(notificationId)) {
            return;
        }
        const updated = new Set(ids);
        updated.add(notificationId);
        this.markedUnreadIdsSubject.next(updated);
        this.persistMarkedUnreadIds(updated);
    }

    clearMarkedUnread(notificationId?: string): void {
        if (!notificationId) {
            return;
        }
        const ids = this.markedUnreadIdsSubject.value;
        if (!ids.has(notificationId)) {
            return;
        }
        const updated = new Set(ids);
        updated.delete(notificationId);
        this.markedUnreadIdsSubject.next(updated);
        this.persistMarkedUnreadIds(updated);
    }

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
                return { routePath: '/assigned-jobs' };

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

    // Some notification types deep-link to a page outside their sidebar list route
    // (e.g. PurchaseApprovalRequest opens /purchase/view-purchase/:id), so a plain
    // routePath-prefix match against calculateRoutePath() never fires when the user
    // instead visits the sidebar list page (/purchase/pendings, /purchase/approves).
    // This maps those types to the extra list-route prefixes that should also clear them.
    private readonly badgeClearRoutePrefixes: Record<string, string[]> = {
        JobAllocated: ['/purchase'],
        ProcurementTransferred: ['/purchase'],
        MrApproved: ['/purchase'],
        PurchaseApprovalRequest: ['/purchase'],
        PurchaseProcurementNotice: ['/purchase'],
        PurchaseApproved: ['/purchase'],
        PurchaseRejected: ['/purchase'],
        LpoApprovalRequest: ['/purchase'],
        LpoApproved: ['/purchase'],
        LpoRejected: ['/purchase'],
    };

    /**
     * Marks every unviewed notification whose type resolves to routePath as read,
     * and updates local state so sidebar/navbar badges clear immediately.
     * Called on navigation so visiting a module's page clears its own badge automatically.
     */
    markAsReadForRoute(routePath: string): void {
        const current = this.textNotificationsSubject.value;
        if (!current.unviewed?.length) {
            return;
        }

        const normalizedRoutePath = routePath.split('?')[0].split('#')[0];
        const matching = current.unviewed.filter(notification => {
            const notifRoutePath = notification.routePath || this.calculateRoutePath(notification).routePath;
            if (notifRoutePath && normalizedRoutePath.startsWith(notifRoutePath)) {
                return true;
            }
            const extraPrefixes = this.badgeClearRoutePrefixes[notification.type];
            return !!extraPrefixes?.some(prefix => normalizedRoutePath.startsWith(prefix));
        });

        if (!matching.length) {
            return;
        }

        const types = Array.from(new Set(matching.map(notification => notification.type)));

        this.employeeService.employeeData$.pipe(take(1)).subscribe(employeeData => {
            if (!employeeData) {
                return;
            }
            this.http.patch(`${this.api}/notification/mark-as-read-by-types`, {
                types,
                recipientId: employeeData._id
            }).subscribe({
                error: (error) => console.error('Error marking notifications as read for route:', error)
            });
        });

        const matchingIds = new Set(matching.map(notification => notification._id));
        const updatedUnviewed = current.unviewed.filter(notification => !matchingIds.has(notification._id));
        const updatedViewed = [...matching, ...current.viewed];
        this.textNotificationsSubject.next({
            viewed: updatedViewed,
            unviewed: updatedUnviewed
        });
    }

    private resolveNotificationNavigation(
        routePath: string,
        routeData?: any
    ): { commands: any[]; extras?: NavigationExtras } | null {
        if (routePath === '/quotations/view' && routeData) {
            const quoteId = routeData?._id?.toString?.() ?? routeData?.toString?.();
            return { commands: [routePath, quoteId] };
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


