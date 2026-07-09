import type { ProviderToken, Type } from "@angular/core";
import type { TestBed } from "@angular/core/testing";

/**
 * Builds a `configureTestBed` callback (ATL render option) that replaces
 * services a standalone component provides in its own `providers` array.
 * Plain test-level `providers` cannot reach those — component providers
 * shadow them — so the stubs go through `TestBed.overrideProvider`, which
 * replaces a token at every level but only for components registered in the
 * TestBed scope; hence the explicit import of the component under test.
 */
export function overrideComponentServices(
  component: Type<unknown>,
  stubs: ReadonlyArray<[ProviderToken<unknown>, unknown]>,
): (testBed: TestBed) => void {
  return (testBed) => {
    testBed.configureTestingModule({ imports: [component] });
    for (const [token, useValue] of stubs) {
      testBed.overrideProvider(token, { useValue });
    }
  };
}
