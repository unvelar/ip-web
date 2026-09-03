import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandNameVariants } from "../src/features/onboarding/OnboardingUi";

describe("BrandNameVariants", () => {
  test("shows canonical and AI-generated names before search generation", () => {
    const markup = renderToStaticMarkup(
      <BrandNameVariants
        names={["Liverpool FC", "Liverpool", "LFC", "Liverpool Football Club"]}
        draft=""
        editable
        onDraftChange={() => undefined}
        onAdd={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(markup).toContain("Brand names we found");
    expect(markup.indexOf(">Liverpool FC<")).toBeLessThan(markup.indexOf(">Liverpool<"));
    expect(markup).toContain("LFC");
    expect(markup).not.toContain(">FC</span>");
    expect(markup).toContain("Remove LFC");
    expect(markup).toContain("Add another name or acronym");
  });
});
