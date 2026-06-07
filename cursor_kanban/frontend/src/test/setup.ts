import "@testing-library/jest-dom";

// scrollIntoView is not implemented in JSDOM
window.HTMLElement.prototype.scrollIntoView = () => undefined;
