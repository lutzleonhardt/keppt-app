import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { TranslocoPipe } from "@jsverse/transloco";
import { LucideArrowLeft, LucideMenu } from "@lucide/angular";

import { KepptMonogramComponent } from "../ui/keppt-monogram";

/**
 * Page chrome shared by all vault screens: icon row (hamburger, or a back
 * button on the daily-note detail) with the centered monogram, then the
 * uppercase subtitle over the serif title. Title/subtitle arrive as resolved
 * strings — screens pass translated chrome or vault-derived labels alike.
 */
@Component({
  selector: "keppt-vault-page-header",
  imports: [KepptMonogramComponent, LucideArrowLeft, LucideMenu, TranslocoPipe],
  templateUrl: "./vault-page-header.html",
  styleUrl: "./vault-page-header.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VaultPageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly back = input(false);

  readonly menuPressed = output<void>();
  readonly backPressed = output<void>();
}
