import { useEffect, useRef } from 'react';
import { useI18n } from '../locales';

/**
 * 30-second promo video (source: marketing/promo-video).
 * Muted autoplay loop; respects prefers-reduced-motion by pausing and exposing controls.
 */
export function PromoVideo() {
  const { t } = useI18n();
  const copy = t.promoVideo;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window.matchMedia !== 'function') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (reduce.matches) {
        video.pause();
        video.controls = true;
      } else {
        video.controls = false;
        void video.play?.()?.catch(() => undefined);
      }
    };
    apply();
    reduce.addEventListener?.('change', apply);
    return () => reduce.removeEventListener?.('change', apply);
  }, []);

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
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/promo/keepxclean-promo-poster.jpg"
          aria-label={copy.ariaLabel}
          width={1280}
          height={720}
        >
          <source src="/promo/keepxclean-promo-web.webm" type="video/webm" />
          <source src="/promo/keepxclean-promo-web.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
