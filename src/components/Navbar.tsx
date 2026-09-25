'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ArrowUpRight, ChevronRight, Languages } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { LINKS } from '../content';

export default function Navbar() {
  const { t, toggle } = useLanguage();

  return (
    <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
      <div className="flex-1 flex">
        <a href="#" className="flex items-center gap-2 md:gap-3">
          <Image
            src="/rawabi/mark.png"
            alt={`${t.brand} ${t.brandTagline}`}
            width={174}
            height={192}
            priority
            className="h-10 md:h-12 w-auto"
          />
          <span className="hidden sm:flex flex-col leading-tight">
            <span className="text-lg md:text-xl tracking-[0.2em] rtl:tracking-normal text-[rgba(10,35,73,0.95)]">
              {t.brand}
            </span>
            <span className="text-[10px] md:text-[11px] uppercase tracking-[0.18em] rtl:tracking-normal text-[#B8873F]">
              {t.brandTagline}
            </span>
          </span>
        </a>
      </div>

      <ul className="hidden md:flex items-center gap-8 text-[rgb(45,45,45)] font-normal text-sm">
        {t.nav.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group"
            >
              {item.label}
              {item.hasDropdown && (
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
              )}
            </a>
          </li>
        ))}
      </ul>

      <div className="flex-1 flex justify-end items-center gap-2 md:gap-3">
        <motion.button
          type="button"
          onClick={toggle}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          aria-label="Switch language"
          className="flex items-center gap-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/20 px-3 py-2 text-xs md:text-sm text-[rgba(10,35,73,0.9)] hover:bg-white/80 transition-colors"
        >
          <Languages className="w-4 h-4 text-[#B8873F]" />
          <span className="ltr:[font-family:var(--font-tajawal)] rtl:[font-family:var(--font-helvetica)]">
            {t.langToggle}
          </span>
        </motion.button>

        <motion.a
          href={LINKS.consultation}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center bg-[rgba(10,35,73,0.85)] text-white rounded-full ps-2 pe-4 md:pe-6 py-1.5 md:py-2 gap-2 md:gap-3 hover:bg-[rgba(10,35,73,1)] transition-colors group"
        >
          <div className="bg-[#C9994F] p-1 md:p-1.5 rounded-full flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white rtl:-scale-x-100" />
          </div>
          <span className="text-xs md:text-sm font-normal whitespace-nowrap">
            {t.cta}
          </span>
        </motion.a>
      </div>
    </nav>
  );
}
