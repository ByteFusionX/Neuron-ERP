import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';


import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { JwtInterceptor } from './app/core/interceptors/jwt-interceptor/jwt.interceptor';
import { ErrorInterceptor } from './app/core/interceptors/error-interceptor/error.interceptor';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { routes } from './app/app.routing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { IconsModule } from './app/lib/icons/icons.module';
import { MatDialogModule } from '@angular/material/dialog';
import { componentModule } from './app/shared/components/component.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { LoadingBarRouterModule } from '@ngx-loading-bar/router';
import { LoadingBarHttpClientModule } from '@ngx-loading-bar/http-client';
import { SocketIoModule, SocketIoConfig } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { MatSidenavModule } from '@angular/material/sidenav';
import { NgxEchartsModule } from 'ngx-echarts';
import { AppComponent } from './app/app.component';
import { importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DatePipe } from '@angular/common';

const config: SocketIoConfig = { url: environment.api, options: {} };




bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(BrowserModule, ToastrModule.forRoot({
            timeOut: 3000,
            positionClass: 'toast-top-right',
            preventDuplicates: true,
        }), IconsModule, MatDialogModule, componentModule, LoadingBarModule, LoadingBarRouterModule, LoadingBarHttpClientModule, SocketIoModule.forRoot(config), MatSidenavModule, NgxEchartsModule.forRoot({
            echarts: () => import('echarts/core')
        }),DatePipe),

        { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi()),
        provideAnimations(),
        provideRouter(routes), 
    ]
})
  .catch(err => console.error(err));
