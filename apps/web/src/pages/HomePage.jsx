import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Hero } from '../components/Hero.jsx';
import { MenuSection } from '../components/MenuSection.jsx';
import { ReservationSection } from '../components/ReservationSection.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { Spotlight } from '../components/Spotlight.jsx';

export function HomePage() {
  const { hash } = useLocation();

  // Arriving at /#reserve from another page needs an explicit scroll: the
  // browser only honours the fragment on a real document load, not on a
  // client-side route change. Retry briefly so a slow first paint does not
  // miss the target.
  useEffect(() => {
    if (!hash) return undefined;

    let attempts = 0;
    let frame = 0;

    const scrollToHash = () => {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 20) frame = window.requestAnimationFrame(scrollToHash);
    };

    frame = window.requestAnimationFrame(scrollToHash);
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <>
      <Reveal>
        <Hero />
      </Reveal>
      <Reveal delay={0.05}>
        <Spotlight />
      </Reveal>
      <Reveal delay={0.08}>
        <MenuSection />
      </Reveal>
      <Reveal delay={0.1}>
        <ReservationSection />
      </Reveal>
    </>
  );
}
