import { describe, it, expect } from "vitest";
import { detectEol } from "./index.js";

describe("detectEol", () => {
  it("detects LF", () => {
    expect(detectEol("a\nb\n")).toBe("\n");
  });
  it("detects CRLF when any CRLF present", () => {
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\nb\r\n")).toBe("\r\n");
  });
  it("defaults to LF on single-line / empty", () => {
    expect(detectEol("")).toBe("\n");
    expect(detectEol("solo")).toBe("\n");
  });
});
