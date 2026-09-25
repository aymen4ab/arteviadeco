import type { Metadata } from 'next';
import App from '@/App';
import '@/index.css';

export const metadata: Metadata = {
  title: 'RIVR',
};

// The root layout puts Inter on <body> via `font-sans`, which would
// override the inherited Helvetica from :root — re-apply it here.
export default function RivrPage() {
  return (
    <div className="font-helvetica">
      <App />
    </div>
  );
}
