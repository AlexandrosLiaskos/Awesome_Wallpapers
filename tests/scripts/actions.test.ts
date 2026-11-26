// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initActions } from '../../src/scripts/actions.ts';

let wired = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } });
  document.body.innerHTML =
    '<button data-copy="#336699"><span data-copy-text>#336699</span></button>' +
    '<button id="plain" data-copy="https://example.com/w/x/">Copy link</button>';
  if (!wired) initActions();
  wired = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const label = () => document.querySelector('[data-copy-text]')!;

describe('copy buttons', () => {
  it('copies the value and says so', async () => {
    label().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('#336699');
    expect(label().textContent).toBe('Copied');
  });

  it('puts the original text back afterwards', async () => {
    label().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(label().textContent).toBe('#336699');
  });

  it('still puts the original text back after a double click', async () => {
    label().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    label().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(label().textContent).toBe('#336699');
  });

  it('works on a button that has no separate label element', async () => {
    const button = document.querySelector('#plain')!;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(button.textContent).toBe('Copy link');
  });
});
