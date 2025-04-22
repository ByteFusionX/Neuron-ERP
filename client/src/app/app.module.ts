import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';
import { SideBarComponent } from './shared/components/side-bar/side-bar.component';
import { ToastrModule } from 'ngx-toastr';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { MatDialogModule } from '@angular/material/dialog';
import { IconsModule } from './lib/icons/icons.module';
import { componentModule } from './shared/components/component.module';
import { JwtInterceptor } from './core/interceptors/jwt-interceptor/jwt.interceptor';
import { ErrorInterceptor } from './core/interceptors/error-interceptor/error.interceptor';
import { ResizableModule } from './shared/components/resizable/resizable.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { LoadingBarRouterModule } from '@ngx-loading-bar/router';
import { SocketIoConfig, SocketIoModule } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { LoadingBarHttpClientModule } from '@ngx-loading-bar/http-client';
import { MatSidenavModule } from '@angular/material/sidenav';
import { NotificationComponent } from './shared/components/notification/notification.component';
import { NgxEchartsModule } from 'ngx-echarts';

const config: SocketIoConfig = { url: environment.api, options: {} };

@NgModule({
    declarations: [
        AppComponent,
    ],
    bootstrap: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        NavBarComponent,
        SideBarComponent,
        ToastrModule.forRoot({
            timeOut: 3000,
            positionClass: 'toast-top-right',
            preventDuplicates: true,
        }),
        IconsModule,
        MatDialogModule,
        componentModule,
        ResizableModule,
        LoadingBarModule,
        LoadingBarRouterModule,
        LoadingBarHttpClientModule,
        SocketIoModule.forRoot(config),
        MatSidenavModule,
        NotificationComponent,
        NgxEchartsModule.forRoot({
            echarts: () => import('echarts/core')
        })
    ], providers: [
        { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi()),

    ],

})
export class AppModule { }
