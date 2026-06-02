import { describe, it, expect, vi } from "vitest";
import { applyFormatToActive } from "../components/FormatToolbar";

describe("applyFormatToActive", () => {
  it("formats selected text in a text input and dispatches 'input' event", () => {
    // 1. Create a text input element and append to body
    const input = document.createElement("input");
    input.type = "text";
    input.value = "Hello World";
    document.body.appendChild(input);

    // 2. Track input event firing
    let eventFired = false;
    let eventValue = "";
    input.addEventListener("input", (e) => {
      eventFired = true;
      eventValue = (e.target as HTMLInputElement).value;
    });

    // Mock React valueTracker if needed, but here we just test standard HTML element behavior
    const trackerMock = {
      setValue: vi.fn(),
    };
    (input as any)._valueTracker = trackerMock;

    // 3. Focus and select "World" (indices 6 to 11)
    input.focus();
    input.setSelectionRange(6, 11);

    // 4. Run applyFormatToActive
    applyFormatToActive("bold");

    // 5. Assertions
    expect(input.value).toBe("Hello **World**");
    expect(eventFired).toBe(true);
    expect(eventValue).toBe("Hello **World**");
    expect(trackerMock.setValue).toHaveBeenCalledWith("Hello World");

    // Cleanup
    document.body.removeChild(input);
  });

  it("formats selected text in a textarea and dispatches 'input' event", () => {
    // 1. Create a textarea element and append to body
    const textarea = document.createElement("textarea");
    textarea.value = "Hello World";
    document.body.appendChild(textarea);

    // 2. Track input event firing
    let eventFired = false;
    let eventValue = "";
    textarea.addEventListener("input", (e) => {
      eventFired = true;
      eventValue = (e.target as HTMLTextAreaElement).value;
    });

    // Mock React valueTracker
    const trackerMock = {
      setValue: vi.fn(),
    };
    (textarea as any)._valueTracker = trackerMock;

    // 3. Focus and select "Hello" (indices 0 to 5)
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    // 4. Run applyFormatToActive
    applyFormatToActive("italic");

    // 5. Assertions
    expect(textarea.value).toBe("*Hello* World");
    expect(eventFired).toBe(true);
    expect(eventValue).toBe("*Hello* World");
    expect(trackerMock.setValue).toHaveBeenCalledWith("Hello World");

    // Cleanup
    document.body.removeChild(textarea);
  });
});
