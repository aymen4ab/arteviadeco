'use client';

import { motion } from 'motion/react';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useLanguage } from './LanguageProvider';

export default function Navbar() {
  const { t, toggle } = useLanguage();

  return (
    <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
      <div className="flex-1 hidden md:block" />

      <ul className="hidden md:flex items-center gap-8 text-[rgb(45,45,45)] font-normal text-sm">
        {t.nav.map((item) => (
          <li
            key={item.href}
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group"
          >
            {item.label}
            {item.hasDropdown && (
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            )}
          </li>
        ))}
        <li
          onClick={toggle}
          className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group"
        >
          {t.langToggle}
        </li>
      </ul>

      <div className="md:hidden flex items-center gap-3">
        <span className="font-regular tracking-tighter rtl:tracking-normal text-xl text-[rgba(30,50,90,0.9)]">
          {t.brand}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="text-[rgb(45,45,45)] font-normal text-sm hover:opacity-70 transition-opacity"
        >
          {t.langToggle}
        </button>
      </div>

      <div className="flex-1 flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center bg-[rgba(30,50,90,0.8)] text-white rounded-full ps-2 pe-4 md:pe-6 py-1.5 md:py-2 gap-2 md:gap-3 hover:bg-[rgba(30,50,90,1)] transition-colors group"
        >
          <div className="bg-white/20 p-1 md:p-1.5 rounded-full flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white rtl:-scale-x-100" />
          </div>
          <span className="text-xs md:text-sm font-normal">{t.cta}</span>
        </motion.button>
      </div>
    </nav>
  );
}
