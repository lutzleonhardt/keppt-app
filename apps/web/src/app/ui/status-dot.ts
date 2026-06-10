import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "keppt-status-dot",
  template: "",
  styleUrl: "./status-dot.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "aria-hidden": "true" },
})
export class StatusDotComponent {}
