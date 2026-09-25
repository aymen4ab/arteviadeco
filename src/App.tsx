import Hero from './components/Hero';
import { LanguageProvider } from './components/LanguageProvider';

export default function App() {
  return (
    <main className="min-h-screen bg-[#f0f0f0]">
      <LanguageProvider>
        <Hero />
      </LanguageProvider>
    </main>
  );
}
