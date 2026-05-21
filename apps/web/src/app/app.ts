import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "keppt-root",
  imports: [RouterOutlet],
  template: "<router-outlet />",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
