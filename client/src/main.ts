
import { SocketIoConfig } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';
import { AppComponent } from './app/app.component';
import { appConfig, MSALInstanceFactory } from './app/app.config';
import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { MSAL_INSTANCE } from '@azure/msal-angular';

async function main() {
  const pca = MSALInstanceFactory();
  await pca.initialize();

  const mergedConfig = mergeApplicationConfig(appConfig, {
    providers: [
      { provide: MSAL_INSTANCE, useValue: pca }
    ]
  });

  await bootstrapApplication(AppComponent, mergedConfig);
}

main().catch(err => console.error(err));
