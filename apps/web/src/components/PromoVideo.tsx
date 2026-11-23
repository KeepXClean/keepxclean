import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../locales';

const WEBM_SOURCE = '/promo/keepxclean-promo-web.webm';
const MP4_SOURCE = '/promo/keepxclean-promo-web.mp4';

/**
 * 30-second promo video (source: marketing/promo-video).
 * Muted autoplay loop; respects prefers-reduced-motion by pausing and exposing controls.
 */
export function PromoVideo() {
  const { t } = useI18n();
  const copy = t.promoVideo;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState(WEBM_SOURCE);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let active = true;
    let attempt = 0;
    const apply = () => {
      const currentAttempt = ++attempt;
      video.autoplay = !reduce?.matches;
      if (reduce?.matches) {
        video.pause();
        setShowControls(true);
      } else {
        setShowControls(false);
        void video.play()?.catch(() => {
          // A rejected request from an old source/preference must not affect its replacement.
          if (active && currentAttempt === attempt) setShowControls(true);
        });
      }
    };
    apply();
    reduce?.addEventListener?.('change', apply);
    return () => {
      active = false;
      reduce?.removeEventListener?.('change', apply);
    };
  }, [source]);

  const handleMediaError = () => {
    // <source> alternatives do not recover from a decoder error after selection.
    // Try the independent H.264 encode once; never loop between failing sources.
    setShowControls(true);
    if (source === WEBM_SOURCE) setSource(MP4_SOURCE);
  };

  return (
    <div className="promo-video">
      <div className="m5-section-header">
        <span className="m5-badge">{copy.badge}</span>
        <h2 className="m5-title">{copy.title}</h2>
        <p className="m5-desc">{copy.sub}</p>
      </div>
      <div className="promo-video-frame">
        <video
          ref={videoRef}
          className="promo-video-media"
          src={source}
          controls={showControls}
          onError={handleMediaError}
          muted
          loop
          playsInline
          preload="metadata"
          poster="/promo/keepxclean-promo-poster.jpg"
          aria-label={copy.ariaLabel}
          width={1280}
          height={720}
        />
      </div>
    </div>
  );
}
