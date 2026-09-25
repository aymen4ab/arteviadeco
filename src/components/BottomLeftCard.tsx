'use client';

import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { LINKS } from '../content';

export default function BottomLeftCard() {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="absolute bottom-28 right-4 left-auto md:left-6 md:right-auto md:bottom-6 lg:bottom-10 lg:left-10 p-3 md:p-4 lg:p-5 rounded-[1.2rem] md:rounded-[1.5rem] lg:rounded-[2.2rem] bg-white/30 backdrop-blur-xl flex flex-col gap-2 lg:gap-3 min-w-[140px] md:min-w-[150px] lg:min-w-[180px] w-fit"
    >
      <div className="flex flex-col">
        <span className="text-2xl md:text-3xl font-normal text-[rgba(10,35,73,0.9)] tracking-tight">
          {t.statValue}
        </span>
        <span className="text-[10px] md:text-[12px] font-normal text-[rgba(10,35,73,0.6)] uppercase tracking-wider rtl:tracking-normal">
          {t.statLabel}
        </span>
      </div>

      <motion.a
        href={LINKS.whatsapp}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center bg-white rounded-full ps-1.5 pe-5 py-1.5 gap-2 hover:bg-white/90 transition-colors self-start group"
      >
        <div className="bg-[rgba(201,153,79,0.18)] p-1 rounded-full flex items-center justify-center">
          <ArrowUpRight className="w-4 h-4 text-[#B8873F] rtl:-scale-x-100" />
        </div>
        <span className="text-[14px] font-normal text-[rgba(10,35,73,0.9)] whitespace-nowrap">
          {t.statCta}
        </span>
      </motion.a>
    </motion.div>
  );
}
