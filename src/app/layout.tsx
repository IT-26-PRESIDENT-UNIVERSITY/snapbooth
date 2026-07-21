import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SnapBooth",
  description: "Modern Digital Photobooth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-[#efefef] text-foreground flex flex-col overflow-x-hidden`}>
        <main className="flex-1 flex flex-col relative w-full">
          {children}
        </main>
        
        {/* Global Credit Footer */}
        <footer className="py-4 text-center bg-[#efefef] text-gray-500 text-[9px] sm:text-[10px] font-medium tracking-widest uppercase relative z-50 px-4 leading-relaxed">
          <div className="flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-3">
            <span>
              Web Developed by{' '}
              <a 
                href="https://it-26-president-university.github.io/it26-profile/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="font-bold text-gray-600 hover:text-black transition-colors"
              >
                Information Technology Batch 2026
              </a>
            </span>
            <span className="hidden md:inline text-gray-400">|</span>
            <span>
              Photostrip Design by{' '}
              <a 
                href="https://vcdpu26.netlify.app/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="font-bold text-gray-600 hover:text-black transition-colors"
              >
                Visual Communication Design Study Batch 2026
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
