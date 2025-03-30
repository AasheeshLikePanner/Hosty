import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

const PremiumAnimatedLogo = () => {
  const logoRef = useRef(null);

  // Entrance animation: slide in from left with a subtle blur that clears up
  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 1 } });
    tl.fromTo(
      logoRef.current,
      { opacity: 0, x: -50, filter: 'blur(4px)' },
      { opacity: 1, x: 0, filter: 'blur(0px)' }
    )
    .to(
      logoRef.current,
      { textShadow: '0px 0px 8px rgba(0, 0, 0, 0.2)', duration: 0.5 },
      '-=0.3'
    );
  }, []);

  // Hover effect: subtle scale, rotation, and enhanced text-shadow for an interactive premium feel
  const handleMouseEnter = () => {
    gsap.to(logoRef.current, {
      scale: 0.8,
      rotation: 0,
    //   textShadow: '0px 0px 15px rgba(0, 0, 0, 0.3)',
      duration: 0.4,
    });
  };

  const handleMouseLeave = () => {
    gsap.to(logoRef.current, {
      scale: 1,
      rotation: 0,
    //   textShadow: '0px 0px 8px rgba(0, 0, 0, 0.2)',
      duration: 0.4,
    });
  };

  return (
    <div
      ref={logoRef}
      className="fixed  top-8 left-8 font-bold text-black text-xl z-10 cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      HOSTY
    </div>
  );
};

export default PremiumAnimatedLogo;
