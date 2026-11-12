import { describe, expect, it } from "vitest";
import { managedBlock, updateManagedBlock } from "./repository-context.js";

const start = "<!-- BTAR:START -->";
const end = "<!-- BTAR:END -->";
const generated = managedBlock("new\n");

describe("managed guidance markers", () => {
  it.each(["pre", "script", "style", "textarea"])("preserves examples after a malformed %s closing tag", (tag) => {
    const original = Buffer.from(`<${tag}>\n</${tag} >\n${start}\nKEEP HUMAN EXAMPLE\n${end}\n</${tag}>\n\n`);
    const updated = updateManagedBlock(original, generated);
    expect(updated.subarray(0, original.length)).toEqual(original);
    expect(updateManagedBlock(updated, generated)).toEqual(updated);
  });
  it.each([
    ["processing instruction", "<?example\n", "?>\n"],
    ["CDATA", "<![CDATA[\n", "]]>\n"],
    ["script", "<script>\n", "</script>\n"],
    ["block tag", "<div>\n", "</div>\n\n"],
    ["generic tag", "<custom-tag>\n", "</custom-tag>\n\n"],
  ])("preserves marker examples inside an HTML %s block", (_kind, open, close) => {
    const original = Buffer.from(`${open}${start}\nexample\n${end}\n${close}`);
    const updated = updateManagedBlock(original, generated);
    expect(updated.subarray(0, original.length)).toEqual(original);
    expect(updateManagedBlock(updated, generated)).toEqual(updated);
  });

  it.each(["<!-- example", "<!EXAMPLE"])("preserves a marker ending an HTML block opened by %s", (open) => {
    const original = Buffer.from(`${open}\n${start}\n\n`);
    const updated = updateManagedBlock(original, generated);
    expect(updated.subarray(0, original.length)).toEqual(original);
    expect(updateManagedBlock(updated, generated)).toEqual(updated);
  });

  it.each(["\r", "\n", "\r\n"])('recognizes markers with %j line endings and preserves surrounding bytes', (eol) => {
    const prefix = Buffer.concat([Buffer.from([0xff]), Buffer.from(` maintainer${eol}`)]);
    const suffix = Buffer.from(`${eol}suffix${eol}`);
    const original = Buffer.concat([prefix, Buffer.from(`${start}${eol}old${eol}${end}`), suffix]);
    const updated = updateManagedBlock(original, generated);
    expect(updated).toEqual(Buffer.concat([prefix, Buffer.from(`${start}\nnew\n${end}`), suffix]));
    expect(updateManagedBlock(updated, generated)).toEqual(updated);
  });

  it.each(["<!-- BTAR:START-->", "<!-- BTAR:END-->", "<!-- BTAR: START -->", "<!-- BTAR:START --> ", "<!-- BTAR:START", "<!-- BTAR:END --!>", "<!-- BTAR:UNKNOWN -->"])('rejects malformed standalone marker %s', (marker) => {
    expect(() => updateManagedBlock(Buffer.from(`${marker}\n`), generated)).toThrow();
  });

  it("preserves inline marker examples", () => {
    const original = Buffer.from(`Documentation: ${start}\n${end} is an example.\n`);
    expect(updateManagedBlock(original, generated)).toEqual(Buffer.concat([original, Buffer.from(generated)]));
  });

  it("rejects an unclosed HTML block before appending markers that it would hide", () => {
    expect(() => updateManagedBlock(Buffer.from("<div>\nunfinished\n"), generated)).toThrow();
  });

  it("retains one CRLF separator following a replaced block", () => {
    const original = Buffer.from(`${start}\r\nold\r\n${end}\r\nsuffix`);
    expect(updateManagedBlock(original, generated).toString()).toBe(`${start}\nnew\n${end}\r\nsuffix`);
  });
});
