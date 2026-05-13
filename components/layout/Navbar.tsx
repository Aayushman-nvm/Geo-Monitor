// components/layout/Navbar.tsx

"use client";

import { SiX, SiGithub } from '@icons-pack/react-simple-icons';
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-gray-700 to-gray-900 border border-gray-700 flex items-center justify-center group-hover:border-gray-600 transition">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="hidden sm:block text-white font-semibold text-sm tracking-tight">
              PLACEHOLDER
            </span>
          </Link>

          {/* Social Links */}
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/yourusername/yourrepo"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
              title="GitHub Repository"
            >
              <SiGithub className="w-4 h-4" />
            </a>
            <a
              href="https://twitter.com/yourusername"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
              title="Twitter"
            >
              <SiX className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
