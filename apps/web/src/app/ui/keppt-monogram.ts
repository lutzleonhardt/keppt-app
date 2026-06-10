import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

@Component({
  selector: "keppt-monogram",
  template: '<span class="glyph">K</span>',
  styleUrl: "./keppt-monogram.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[style.--keppt-monogram-size.px]": "size()",
    "[style.--keppt-monogram-glyph-size.px]": "glyphSize()",
    "aria-hidden": "true",
  },
})
export class KepptMonogramComponent {
  readonly size = input(26);

  protected readonly glyphSize = computed(() => Math.round(this.size() * 0.7));
}
