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
        <footer className="py-3 text-center bg-[#efefef] text-gray-500 text-[10px] font-semibold tracking-widest uppercase relative z-50">
          <a 
            href="https://it-26-president-university.github.io/it26-profile/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline transition-all"
            >
            created jointly by students at President University IT 26
          </a>
        </footer>
      </body>
    </html>
  );
}
