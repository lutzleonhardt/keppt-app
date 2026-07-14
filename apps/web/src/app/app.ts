import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { AppDrawerComponent } from "./navigation/app-drawer";

@Component({
  selector: "keppt-root",
  imports: [AppDrawerComponent, RouterOutlet],
  // The drawer lives once at the root as an overlay over whatever screen is
  // routed; screens only ask the NavigationService to open it.
  template: "<router-outlet /><keppt-app-drawer />",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
