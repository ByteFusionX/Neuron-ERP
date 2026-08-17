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

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            this.subscribedSubject.next(false);
            return;
        }

        const registration = await navigator.serviceWorker.register('/sw-push.js');
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(environment.vapidPublicKey),
            });
        }

        const subscriptionJson = subscription.toJSON();
        await firstValueFrom(this.http.post(`${this.api}/push-subscription/subscribe`, {
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
            userAgent: navigator.userAgent,
        }));
        this.subscribedSubject.next(true);
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
