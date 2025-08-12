import { ApplicationConfig, importProvidersFrom } from "@angular/core";
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { JwtInterceptor } from './core/interceptors/jwt-interceptor/jwt.interceptor';
import { ErrorInterceptor } from './core/interceptors/error-interceptor/error.interceptor';
import { BrowserModule } from '@angular/platform-browser';
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
import { provideRouter } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MsalModule, MsalService } from '@azure/msal-angular';
import { IPublicClientApplication, PublicClientApplication, BrowserCacheLocation, LogLevel } from '@azure/msal-browser';
import { environment } from 'src/environments/environment';

const socketConfig: SocketIoConfig = { url: environment.api, options: {} };

const isIE = window.navigator.userAgent.indexOf("MSIE ") > -1 || window.navigator.userAgent.indexOf("Trident/") > -1;

export function loggerCallback(logLevel: LogLevel, message: string) {
  console.log(message);
}

export function MSALInstanceFactory(): IPublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: environment.microsoftClientId,
      authority: `https://login.microsoftonline.com/${environment.microsoftTenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
      storeAuthStateInCookie: isIE,
    },
    system: {
      loggerOptions: {
        loggerCallback,
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false
      }
    }
  });
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

    { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    provideRouter(routes),
    MsalService,
  ]
}
