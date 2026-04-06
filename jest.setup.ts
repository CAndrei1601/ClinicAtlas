import "@testing-library/jest-dom";

// Polyfill URL for jsdom
global.URL.createObjectURL = jest.fn(() => "blob:mock");
global.URL.revokeObjectURL = jest.fn();

// Silence act() warnings from async state updates
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("act(")) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
