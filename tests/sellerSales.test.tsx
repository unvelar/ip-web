import {expect, test} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import {SellerSales} from "../src/features/sellers/SellerSales";

test("seller sales preserve the lower bound and capture date", () => {
  const html = renderToStaticMarkup(<SellerSales count={25} observation={{value:25,lower_bound:true,source_text:"25+ items sold",observed_at:"2026-09-11T12:24:43Z"}} />);
  expect(html).toContain("25+ sales");
  expect(html).toContain("checked");
  expect(html).toContain("2026");
  expect(html).toContain("25+ items sold");
});

test("legacy and mismatched observations never claim a current capture date", () => {
  expect(renderToStaticMarkup(<SellerSales count={5} />)).toContain("capture date unknown");
  const html = renderToStaticMarkup(<SellerSales count={5} observation={{value:25,lower_bound:true,source_text:"25+ items sold",observed_at:"2026-09-11T12:24:43Z"}} />);
  expect(html).toContain("5 sales");
  expect(html).not.toContain("5+ sales");
  expect(html).toContain("capture date unknown");
});
