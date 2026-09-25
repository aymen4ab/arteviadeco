'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ArrowUpRight, ChevronRight } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'الرئيسية', hasDropdown: false },
  { label: 'خدماتنا', hasDropdown: true },
  { label: 'مشاريعنا', hasDropdown: true },
  { label: 'من نحن', hasDropdown: false },
  { label: 'تواصل معنا', hasDropdown: false },
];

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
      <div className="flex-1 hidden md:block">
        <Image
          src="/rawabi/mark.png"
          alt="روابي لخدمات التصميم"
          width={174}
          height={192}
          priority
          className="h-12 w-auto"
        />
      </div>

      <ul
        dir="rtl"
        className="hidden md:flex items-center gap-8 text-[rgb(45,45,45)] font-normal text-sm [font-family:var(--font-tajawal)]"
      >
        {NAV_ITEMS.map((item) => (
          <li
            key={item.label}
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group"
          >
            {item.label}
            {item.hasDropdown && (
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </li>
        ))}
      </ul>

      <div className="md:hidden">
        <Image
          src="/rawabi/mark.png"
          alt="روابي لخدمات التصميم"
          width={174}
          height={192}
          priority
          className="h-10 w-auto"
        />
      </div>

      <div className="flex-1 flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center bg-[rgba(30,50,90,0.8)] text-white rounded-full pl-2 pr-4 md:pr-6 py-1.5 md:py-2 gap-2 md:gap-3 hover:bg-[rgba(30,50,90,1)] transition-colors group"
        >
          <div className="bg-white/20 p-1 md:p-1.5 rounded-full flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <span className="text-xs md:text-sm font-normal">Book Demo</span>
        </motion.button>
      </div>
    </nav>
  );
}
