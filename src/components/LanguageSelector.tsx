import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store';

const languages = [
  { code: 'en', name: 'English', flag: 'us' },
  { code: 'pt-BR', name: 'Português', flag: 'br' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'it', name: 'Italiano', flag: 'it' },
];

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const { theme } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-all outline-none focus:ring-2 focus:ring-emerald-500/20 ${
          theme === 'dark'
            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'
        }`}
      >
        <img
          src={`https://flagcdn.com/w40/${currentLanguage.flag}.png`}
          alt={currentLanguage.name}
          className="w-4 h-3 object-cover rounded-sm shadow-sm"
          referrerPolicy="no-referrer"
        />
        <span>{currentLanguage.name}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute right-0 mt-2 w-40 z-50 rounded-lg border shadow-xl overflow-hidden ${
              theme === 'dark'
                ? 'bg-zinc-800 border-zinc-700'
                : 'bg-white border-zinc-200'
            }`}
          >
            <div className="py-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                    i18n.language === lang.code
                      ? (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                      : (theme === 'dark' ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-700 hover:bg-zinc-50')
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://flagcdn.com/w40/${lang.flag}.png`}
                      alt={lang.name}
                      className="w-4 h-3 object-cover rounded-sm shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                    <span>{lang.name}</span>
                  </div>
                  {i18n.language === lang.code && <Check size={12} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
