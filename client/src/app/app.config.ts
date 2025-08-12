import { ApplicationConfig } from "@angular/core";
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';


import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ErrorInterceptor } from './core/interceptors/error-interceptor/error.interceptor';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { routes } from './app.routing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { IconsModule } from './lib/icons/icons.module';
import { MatDialogModule } from '@angular/material/dialog';
import { componentModule } from './shared/components/component.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { LoadingBarRouterModule } from '@ngx-loading-bar/router';
import { LoadingBarHttpClientModule } from '@ngx-loading-bar/http-client';
import { SocketIoModule, SocketIoConfig } from 'ngx-socket-io';
import { MatSidenavModule } from '@angular/material/sidenav';
import { NgxEchartsModule } from 'ngx-echarts';
import { importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DatePipe } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { MsalModule, MsalGuard, MsalInterceptor, MsalService, MSAL_INSTANCE, MSAL_GUARD_CONFIG, MSAL_INTERCEPTOR_CONFIG, MsalGuardConfiguration, MsalInterceptorConfiguration } from '@azure/msal-angular';
import { IPublicClientApplication, PublicClientApplication, InteractionType, BrowserCacheLocation, LogLevel } from '@azure/msal-browser';
import { environment } from 'src/environments/environment';
import { provideNgIdle } from "@ng-idle/core";


const socketConfig: SocketIoConfig = { url: environment.api, options: {} };

const isIE = window.navigator.userAgent.indexOf("MSIE ") > -1 || window.navigator.userAgent.indexOf("Trident/") > -1;

export function loggerCallback(logLevel: LogLevel, message: string) {
  console.log(message);
}

export function MSALInstanceFactory(): IPublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: 'afa89863-e652-4049-825f-efa5df28ceec',
      authority: 'https://login.microsoftonline.com/37523550-92de-4ec6-8e2c-9a7ebc99d8e6',
      redirectUri: 'http://localhost:4200',
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
      storeAuthStateInCookie: isIE,
    },
    system: {
      loggerOptions: {
        loggerCallback,
        logLevel: LogLevel.Info,
        piiLoggingEnabled: false
      }
    }
  });
}

export function MSALInterceptorConfigFactory(): MsalInterceptorConfiguration {
  const protectedResourceMap = new Map<string, Array<string>>();
  protectedResourceMap.set('https://graph.microsoft.com/v1.0/me', ['user.read']);
  protectedResourceMap.set(environment.api, ['api://afa89863-e652-4049-825f-efa5df28ceec/access_as_user']);

  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
  };
}

export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['user.read']
    }
  };
}

export const appConfig: ApplicationConfig = {
    providers: [
        importProvidersFrom(BrowserModule, ToastrModule.forRoot({
            timeOut: 3000,
            positionClass: 'toast-top-right',
            preventDuplicates: true,
        }), IconsModule, MatDialogModule, componentModule, LoadingBarModule, LoadingBarRouterModule, LoadingBarHttpClientModule, SocketIoModule.forRoot(socketConfig), MatSidenavModule, NgxEchartsModule.forRoot({
            echarts: () => import('echarts/core')
        }), DatePipe, MsalModule),

        provideHttpClient(withInterceptorsFromDi()),
        provideAnimations(),
        provideRouter(routes),
        provideAnimationsAsync(),
        providePrimeNG({
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: '.my-app-dark'
                }
            }
        }),
        provideNgIdle(),
        { provide: HTTP_INTERCEPTORS, useClass: MsalInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
        { provide: MSAL_INSTANCE, useFactory: MSALInstanceFactory },
        { provide: MSAL_GUARD_CONFIG, useFactory: MSALGuardConfigFactory },
        { provide: MSAL_INTERCEPTOR_CONFIG, useFactory: MSALInterceptorConfigFactory },
        MsalService,
        MsalGuard,

    ]
}

