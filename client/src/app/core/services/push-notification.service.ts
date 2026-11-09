import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { firstValueFrom, BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class PushNotificationService {
    api: string = environment.api;

    subscribedSubject = new BehaviorSubject<boolean>(false);
    subscribed$ = this.subscribedSubject.asObservable();

    /** Last subscribe failure (null when the last attempt worked); a UI can show it. */
    errorSubject = new BehaviorSubject<string | null>(null);
    error$ = this.errorSubject.asObservable();

    get isSupported(): boolean {
        return 'serviceWorker' in navigator && 'PushManager' in window && !!environment.vapidPublicKey;
    }

    constructor(private http: HttpClient) { }

    async refreshStatus(): Promise<void> {
        if (!this.isSupported) {
            this.subscribedSubject.next(false);
            return;
        }
        const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
        const subscription = await registration?.pushManager.getSubscription();
        this.subscribedSubject.next(!!subscription && Notification.permission === 'granted');
    }

    async registerAndSubscribe(): Promise<void> {
        if (!this.isSupported) {
            return;
        }

        if (Notification.permission === 'denied') {
            this.subscribedSubject.next(false);
            return;
        }
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') {
            this.subscribedSubject.next(false);
            return;
        }

        const registration = await navigator.serviceWorker.register('/sw-push.js');
        await navigator.serviceWorker.ready;

        const subscribe = () => registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array(environment.vapidPublicKey) as BufferSource,
        });
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await subscribe();
        } else {
            // a subscription made with a different VAPID key can never receive pushes: replace it
            const current = subscription.options?.applicationServerKey;
            const expected = this.urlBase64ToUint8Array(environment.vapidPublicKey);
            const same = !!current && new Uint8Array(current).length === expected.length
                && new Uint8Array(current).every((b, i) => b === expected[i]);
            if (current && !same) {
                await subscription.unsubscribe();
                subscription = await subscribe();
            }
        }

        const subscriptionJson = subscription.toJSON();
        await firstValueFrom(this.http.post(`${this.api}/employee/push-subscription`, {
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
            userAgent: navigator.userAgent,
        }, { withCredentials: true }));
        this.errorSubject.next(null);
        this.subscribedSubject.next(true);
    }

    private gestureRetryArmed = false;

    /**
     * Asks for browser notification permission whenever it hasn't been decided yet.
     * Browsers often ignore a prompt that has no user gesture, so if it is still undecided
     * afterwards, retry once on the user's next click/keypress.
     */
    async ensurePermissionPrompt(): Promise<void> {
        if (!this.isSupported) return;
        try {
            await this.registerAndSubscribe();
        } catch (error) {
            console.error('Push notification setup failed:', error);
            this.errorSubject.next(error instanceof Error ? error.message : 'Push notification setup failed');
            this.subscribedSubject.next(false);
        }
        if (Notification.permission !== 'default' || this.gestureRetryArmed) return;
        this.gestureRetryArmed = true;
        const retry = () => {
            document.removeEventListener('click', retry, true);
            document.removeEventListener('keydown', retry, true);
            this.gestureRetryArmed = false;
            this.ensurePermissionPrompt();
        };
        document.addEventListener('click', retry, true);
        document.addEventListener('keydown', retry, true);
    }

    async unsubscribe(): Promise<void> {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) {
            this.subscribedSubject.next(false);
            return;
        }

        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await firstValueFrom(this.http.post(`${this.api}/push-subscription/unsubscribe`, { endpoint }));
        this.subscribedSubject.next(false);
    }

    async toggle(): Promise<void> {
        if (this.subscribedSubject.value) {
            await this.unsubscribe();
        } else {
            await this.registerAndSubscribe();
        }
    }

    private urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    }
}
