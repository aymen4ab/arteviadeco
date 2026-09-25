export type Lang = 'en' | 'ar';

// Replace these with Rawabi's real links (e.g. https://wa.me/9665XXXXXXXX,
// https://instagram.com/<handle>). '#' keeps the buttons inert until then.
export const LINKS = {
  consultation: '#',
  whatsapp: '#',
  portfolio: '#',
};

export const CONTENT = {
  en: {
    brand: 'Rawabi',
    brandTagline: 'Design Services',
    nav: [
      { label: 'Services', href: '#services', hasDropdown: true },
      { label: 'Projects', href: '#projects', hasDropdown: true },
      { label: 'About Us', href: '#about', hasDropdown: false },
      { label: 'Contact', href: '#contact', hasDropdown: false },
    ],
    cta: 'Book a Consultation',
    langToggle: 'العربية',
    badge: 'Architecture & Interior Design',
    titleLead: 'Designing Spaces',
    titleAccent: 'That Rise',
    subtitle:
      'Architectural, interior and landscape design — from the first sketch to the final finish, crafted with precision and elegance.',
    statValue: '+150',
    statLabel: 'Projects Delivered',
    statCta: 'WhatsApp Us',
    cornerTitle: 'Our Portfolio',
    cornerLink: 'View Projects',
  },
  ar: {
    brand: 'روابي',
    brandTagline: 'لخدمات التصميم',
    nav: [
      { label: 'خدماتنا', href: '#services', hasDropdown: true },
      { label: 'مشاريعنا', href: '#projects', hasDropdown: true },
      { label: 'من نحن', href: '#about', hasDropdown: false },
      { label: 'تواصل معنا', href: '#contact', hasDropdown: false },
    ],
    cta: 'احجز استشارة',
    langToggle: 'EN',
    badge: 'تصميم معماري وداخلي',
    titleLead: 'نصمّم مساحات',
    titleAccent: 'ترتقي',
    subtitle:
      'تصميم معماري وداخلي وتنسيق مواقع — من الفكرة الأولى حتى اللمسة الأخيرة، بدقة وأناقة.',
    statValue: '+150',
    statLabel: 'مشروع منجز',
    statCta: 'راسلنا واتساب',
    cornerTitle: 'معرض أعمالنا',
    cornerLink: 'تصفح المشاريع',
  },
} satisfies Record<Lang, unknown>;
