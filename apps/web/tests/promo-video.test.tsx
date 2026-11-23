// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/locales';
import { PromoVideo } from '../src/components/PromoVideo';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Promo video playback recovery', () => {
  let container: HTMLDivElement;
  let root: Root;
  let reducedMotion: boolean;
  let preferenceListeners: Set<() => void>;
  let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let pause: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    reducedMotion = false;
    preferenceListeners = new Set();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return reducedMotion; },
      addEventListener: (_: string, listener: () => void) => preferenceListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => preferenceListeners.delete(listener),
    })));
    play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    pause = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => {
      root.render(<I18nProvider initialLocale="en"><PromoVideo /></I18nProvider>);
    });
    return container.querySelector('video')!;
  }

  async function fail(video: HTMLVideoElement) {
    await act(async () => { video.dispatchEvent(new Event('error')); });
  }

  async function setReducedMotion(value: boolean) {
    await act(async () => {
      reducedMotion = value;
      preferenceListeners.forEach((listener) => listener());
    });
  }

  it('starts muted looping playback without hiding a failed request', async () => {
    const video = await mount();
    expect(video.src).toMatch(/\.webm$/);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.controls).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  });

  it('recovers a selected WebM decoder failure with MP4, without an infinite retry loop', async () => {
    const video = await mount();
    await fail(video);
    expect(video.src).toMatch(/\.mp4$/);
    expect(play).toHaveBeenCalledTimes(2);
    await fail(video);
    expect(video.src).toMatch(/\.mp4$/);
    expect(video.controls).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('offers manual playback when autoplay permission is denied', async () => {
    play.mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError'));
    const video = await mount();
    expect(video.controls).toBe(true);
    expect(video.src).toMatch(/\.webm$/);
  });

  it('keeps reduced-motion playback manual, including after a format fallback', async () => {
    reducedMotion = true;
    const video = await mount();
    await fail(video);
    expect(video.src).toMatch(/\.mp4$/);
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });

  it('responds to motion preference changes while a play request is pending', async () => {
    let rejectPending!: (error: Error) => void;
    play.mockImplementationOnce(() => new Promise((_, reject) => { rejectPending = reject; }));
    const video = await mount();
    await setReducedMotion(true);
    await act(async () => { rejectPending(new DOMException('Paused', 'AbortError')); });
    expect(video.autoplay).toBe(false);
    expect(video.controls).toBe(true);
    await setReducedMotion(false);
    expect(video.autoplay).toBe(true);
    expect(video.controls).toBe(false);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('ignores rejection of the old source after MP4 starts successfully', async () => {
    let rejectWebm!: (error: Error) => void;
    play.mockImplementationOnce(() => new Promise((_, reject) => { rejectWebm = reject; }));
    const video = await mount();
    await fail(video);
    await act(async () => { rejectWebm(new DOMException('Source replaced', 'AbortError')); });
    expect(video.src).toMatch(/\.mp4$/);
    expect(video.controls).toBe(false);
    expect(preferenceListeners.size).toBe(1);
  });

  it('still attempts playback when matchMedia is unavailable', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const video = await mount();
    expect(video.autoplay).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });

  it('removes preference listeners and ignores pending playback after unmount', async () => {
    let rejectPending!: (error: Error) => void;
    play.mockImplementationOnce(() => new Promise((_, reject) => { rejectPending = reject; }));
    await mount();
    await act(async () => { root.render(null); });
    expect(preferenceListeners.size).toBe(0);
    await act(async () => { rejectPending(new DOMException('Unmounted', 'AbortError')); });
    expect(container.querySelector('video')).toBeNull();
  });
});
