// components/ui/Popup.tsx

'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './Button';

interface PopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function Popup({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className 
}: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const sizes = {
    sm: 'w-[400px] max-w-[90vw]',
    md: 'w-[600px] max-w-[90vw]',
    lg: 'w-[800px] max-w-[90vw]',
    xl: 'w-[1000px] max-w-[95vw]',
  };

  // Center popup on mount
  useEffect(() => {
    if (isOpen && popupRef.current && !isMaximized) {
      const rect = popupRef.current.getBoundingClientRect();
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: Math.max(40, (window.innerHeight - rect.height) / 2 - 40),
      });
    }
  }, [isOpen, isMaximized]);

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: Math.max(0, e.clientY - dragStart.y),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, position]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />

      {/* Popup */}
      <div
        ref={popupRef}
        className={cn(
          'fixed bg-black border border-gray-700 shadow-2xl flex flex-col z-50 transition-all',
          isMaximized 
            ? 'inset-4 rounded-none' 
            : `${sizes[size]} max-h-[85vh] rounded-xl`,
          className
        )}
        style={
          isMaximized 
            ? undefined 
            : {
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: isDragging ? 'scale(1.02)' : 'scale(1)',
              }
        }
      >
        {/* Header - Draggable */}
        <div
          ref={headerRef}
          className={cn(
            'flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80',
            !isMaximized && 'cursor-move rounded-t-xl'
          )}
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-sm font-semibold text-white select-none">{title}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 hover:bg-gray-800 rounded-md transition text-gray-400 hover:text-white"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-800 rounded-md transition text-gray-400 hover:text-white"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}