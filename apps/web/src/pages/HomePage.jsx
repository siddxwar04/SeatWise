import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Hero } from '../components/Hero.jsx';
import { MenuSection } from '../components/MenuSection.jsx';
import { ReservationSection } from '../components/ReservationSection.jsx';
import { Spotlight } from '../components/Spotlight.jsx';

export function HomePage() {
  const { hash } = useLocation();

  // Arriving at /#reserve from another page needs an explicit scroll: the
  // browser only honours the fragment on a real document load, not on a
  // client-side route change.
  useEffect(() => {
    if (!hash) return;
    const target = document.querySelector(hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <>
      <Hero />
      <Spotlight />
      <MenuSection />
      <ReservationSection />
    </>
  );
}
