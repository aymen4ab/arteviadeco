'use client';

import { motion } from 'motion/react';
import Navbar from './Navbar';
import HeroBadge from './HeroBadge';
import BottomLeftCard from './BottomLeftCard';
import BottomRightCorner from './BottomRightCorner';
import { useLanguage } from './LanguageProvider';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4';

export default function Hero() {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  return (
    <div className="w-full h-screen flex items-center justify-center p-3 md:p-5 bg-[#f0f0f0]">
      <section
        lang={lang}
        dir={isAr ? 'rtl' : 'ltr'}
        className={`relative w-full max-w-[1536px] h-full rounded-[1.5rem] md:rounded-[3rem] overflow-hidden shadow-none flex flex-col items-center bg-white/10 group ${isAr ? '[font-family:var(--font-tajawal)]' : ''}`}
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover object-[65%] lg:object-center z-0"
        >
          <source src={VIDEO_URL} type="video/mp4" />
        </video>

        <div className="relative z-10 w-full h-full flex flex-col items-center">
          <Navbar />

          <div className="w-full flex flex-col items-center pt-8 px-6 text-center max-w-4xl">
            <HeroBadge />
            <motion.h1
              key={`title-${lang}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-[80px] font-normal text-[rgba(10,35,73,0.92)] mb-2 tracking-tight rtl:tracking-normal leading-[1.05] rtl:leading-[1.25]"
            >
              {t.titleLead}{' '}
              <span className="bg-gradient-to-r from-[#B8873F] via-[#E3BC76] to-[#B8873F] bg-clip-text text-transparent">
                {t.titleAccent}
              </span>
            </motion.h1>
            <motion.p
              key={`subtitle-${lang}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-sm sm:text-base md:text-lg text-[#5E6470] opacity-80 leading-relaxed max-w-xl font-normal"
            >
              {t.subtitle}
            </motion.p>
          </div>

          <BottomLeftCard />
          <BottomRightCorner />
        </div>
      </section>
    </div>
  );
}
