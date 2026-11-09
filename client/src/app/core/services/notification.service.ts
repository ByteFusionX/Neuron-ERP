import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subject, Subscription, switchMap, take } from 'rxjs';
import { PushNotificationService } from './push-notification.service';
import { Socket } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { TextNotification } from 'src/app/shared/interfaces/notification.interface';
import { EmployeeService } from './employee/employee.service';
import { setAccessToken } from '../auth/token-store';
import { Router, NavigationExtras } from '@angular/router';
import { SameRouteNavigationService } from './same-route-navigation.service';

export type NotificationChannel = 'inapp' | 'push' | 'email';

export interface NotificationPreferences {
    muted: Record<NotificationChannel, string[]>;
    emailDigest: string[];
    types: string[];
    emailAvailable: boolean;
}

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
        private sameRouteNavigation: SameRouteNavigationService,
        private pushNotificationService: PushNotificationService
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
                return {
                    routePath: '/announcements',
                    routeData: { id: additionalData?.announcementId || referenceId?._id?.toString() || referenceId?.toString() },
                };
            
            case 'AssignedJob':
                return { routePath: '/presales' };
            case 'ReAssignedJob':
                return { routePath: '/presales' };

            case 'FeedbackGiven':
                return { routePath: '/presales' };

            case 'FeedbackRequest':
            case 'Enquiry':
            case 'PresaleRejected':
            case 'EnquiryEstimationReady':
            case 'EnquiryFollowUpOverdue':
                const enquiryId = additionalData?.enquiryId || referenceId?._id?.toString() || referenceId?.toString();
                return {
                    routePath: '/enquiry',
                    routeData: { enquiryId }
                };

            case 'QuotationWon':
            case 'QuotationFollowUpOverdue':
                return {
                    routePath: '/quotations/view',
                    routeData: { _id: additionalData?.quotationId || referenceId?._id?.toString?.() }
                };

            case 'PurchaseFollowUpOverdue':
                return {
                    routePath: '/purchase/view-purchase',
                    routeData: { purchaseId: additionalData?.purchaseId || referenceId?._id?.toString?.() }
                };

            case 'LpoCancelled':
                return {
                    routePath: '/purchase/view-lpo',
                    routeData: { purchaseOrderId: additionalData?.purchaseOrderId || referenceId?._id?.toString?.() }
                };

            case 'GrnCreated':
                return { routePath: '/grn/view-grn', routeData: { grnId: additionalData?.grnId || referenceId?._id?.toString?.() } };

            case 'DnItemsRejected':
            case 'DnDispatched':
            case 'DnDelivered':
                return { routePath: '/dispatch/view', routeData: { dnId: additionalData?.dnId || referenceId?._id?.toString?.() } };

            case 'InvoiceRejected':
            case 'InvoiceOverdue':
                return { routePath: '/finance/receivables' };

            case 'PdcRejected':
            case 'ProformaPaymentConfirmed':
                return { routePath: '/finance/vendor-bills' };

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
            case 'LpoPlaced':
                return { routePath: '/grn/grn-list', routeData: { view: 'arriving' } };
            case 'LpoDeliveryDue':
                return { routePath: '/grn/grn-list', routeData: { view: 'arriving' } };
            case 'LpoPlacedBilling':
                return { routePath: '/finance/vendor-bills', routeData: { view: 'upcoming' } };
            case 'GrnItemsRejected':
                return { routePath: '/grn/view-grn', routeData: { grnId: additionalData?.grnId || referenceId?._id?.toString?.() || referenceId?.toString?.() } };
            case 'LpoApprovalRequest':
                return {
                    routePath: '/purchase/po',
                    routeData: { view: 'pending' }
                };
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

    private liveSub?: Subscription;
    private reconnectSub?: Subscription;
    private authErrorSub?: Subscription;
    private recovering = false;
    private pushClickBound = false;

    private recoverSocketAuth(): void {
        if (this.recovering || !this.employeeService.getToken()) return;
        this.recovering = true;
        this.employeeService.refreshAccessToken().subscribe({
            next: ({ token }) => {
                this.recovering = false;
                setAccessToken(token);
                this.socket.disconnect();
                this.socket.connect(); // 'connect' handler re-auths with the fresh token
                this.getEmployeeTextNotifications(); // catch up on anything missed while offline
            },
            error: () => { this.recovering = false; },
        });
    }

    /** Starts (or restarts) notifications for the signed-in user: socket auth, list, live feed, push. */
    startSession(): void {
        // A click on a push notification (handled by the service worker) asks the open tab to go to its page.
        if (!this.pushClickBound && 'serviceWorker' in navigator) {
            this.pushClickBound = true;
            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event.data;
                if (data?.type === 'PUSH_NOTIFICATION_CLICK' && data.routePath) {
                    this.navigateToNotification({ routePath: data.routePath, routeData: data.routeData } as any);
                }
            });
        }
        this.socket.connect();
        this.authSocketIo(this.employeeService.getToken());
        // A reconnect creates a fresh server socket with no room; re-auth with the current (refreshed) token.
        this.reconnectSub?.unsubscribe();
        this.reconnectSub = this.socket.fromEvent('connect').subscribe(() => this.authSocketIo(this.employeeService.getToken()));
        // The server rejects an expired access token and drops the socket (no auto-reconnect after a
        // server-initiated disconnect). Renew the token with the refresh cookie, then reconnect once.
        this.authErrorSub?.unsubscribe();
        this.authErrorSub = this.socket.fromEvent('auth_error').subscribe(() => this.recoverSocketAuth());
        this.getEmployeeTextNotifications();
        this.initializeNotifications();
        this.pushNotificationService.ensurePermissionPrompt();
    }

    /** Ends notifications for the current user on sign-out / session expiry. */
    endSession(): void {
        this.liveSub?.unsubscribe();
        this.liveSub = undefined;
        this.reconnectSub?.unsubscribe();
        this.reconnectSub = undefined;
        this.authErrorSub?.unsubscribe();
        this.authErrorSub = undefined;
        this.textNotificationsSubject.next({ viewed: [], unviewed: [] });
        this.markedUnreadIdsSubject.next(new Set());
        this.socket.disconnect();
    }

    initializeNotifications() {
        this.liveSub?.unsubscribe();
        this.liveSub = this.socket.fromEvent('recieveNotifications').subscribe(
            {
                next: (notification) => {
                    console.log('notification', notification);
                    const routeInfo = this.calculateRoutePath(notification);
                    const notificationWithRoute = {
                        ...notification,
                        routePath: routeInfo.routePath,
                        routeData: routeInfo.routeData
                    };
                    const current = this.textNotificationsSubject.value
                    if (current.unviewed.some(n => n._id && n._id === notificationWithRoute._id)) return;
                    this.textNotificationsSubject.next({ ...current, unviewed: [notificationWithRoute, ...current.unviewed] })
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

    getPreferences(): Observable<NotificationPreferences> {
        return this.http.get<NotificationPreferences>(`${this.api}/notification/preferences`);
    }

    savePreferences(preferences: Pick<NotificationPreferences, 'muted' | 'emailDigest'>): Observable<any> {
        return this.http.put(`${this.api}/notification/preferences`, preferences);
    }

    authSocketIo(token: string | null | undefined) {
        if (!token) return;
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

    /** Marks every unread notification read, updating local state first so badges clear at once. */
    markAllAsRead(): Observable<any> {
        const current = this.textNotificationsSubject.value;
        this.textNotificationsSubject.next({ viewed: [...current.unviewed, ...current.viewed], unviewed: [] });
        this.markedUnreadIdsSubject.next(new Set());
        this.persistMarkedUnreadIds(new Set());
        return this.http.patch(`${this.api}/notification/mark-all-as-read`, {});
    }

    /** Hides a notification for this user (server status 'archived'). */
    dismiss(notificationId: string): Observable<any> {
        const current = this.textNotificationsSubject.value;
        this.textNotificationsSubject.next({
            viewed: current.viewed.filter(n => n._id !== notificationId),
            unviewed: current.unviewed.filter(n => n._id !== notificationId),
        });
        this.clearMarkedUnread(notificationId);
        return this.http.patch(`${this.api}/notification/dismiss`, { notificationId });
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
        if (routePath === '/announcements' && routeData?.id) {
            return { commands: [routePath], extras: { queryParams: { id: routeData.id } } };
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
        if (routePath === '/purchase/po') {
            return { commands: [routePath], extras: routeData?.view ? { queryParams: { view: routeData.view } } : undefined };
        }
        if ((routePath === '/grn/view-grn' || routePath === '/grn/rejections') && routeData?.grnId) {
            return { commands: ['/grn/view-grn', routeData.grnId] };
        }
        if (routePath === '/purchase/view-lpo' && routeData?.purchaseOrderId) {
            return { commands: [routePath, routeData.purchaseOrderId] };
        }
        if (routePath === '/dispatch/view' && routeData?.dnId) {
            return { commands: [routePath, routeData.dnId] };
        }
        if (routePath === '/grn/grn-list') {
            return { commands: [routePath], extras: routeData?.view ? { queryParams: { view: routeData.view } } : undefined };
        }
        if (routePath === '/purchase-order/pending-approval') {
            return { commands: ['/purchase/po'], extras: { queryParams: { view: 'pending' } } };
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


