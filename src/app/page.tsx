import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import App from '@/App';
import '@/index.css';

const tajawal = Tajawal({
  variable: '--font-tajawal',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: {
    absolute: 'Rawabi Design Services | روابي لخدمات التصميم',
  },
  description:
    'Rawabi Design Services — architectural, interior and landscape design. روابي لخدمات التصميم — تصميم معماري وداخلي وتنسيق مواقع.',
  robots: { index: true, follow: true },
  icons: { icon: [{ url: '/rawabi/mark.png' }] },
  openGraph: {
    title: 'Rawabi Design Services | روابي لخدمات التصميم',
    images: [{ url: '/rawabi/logo.png' }],
  },
};

// The root layout puts Inter on <body> via `font-sans`, which would
// override the inherited Helvetica from :root — re-apply it here.
export default function HomePage() {
  return (
    <div className={`${tajawal.variable} font-helvetica`}>
      <App />
    </div>
  );
}
