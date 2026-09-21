'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'success';
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Proceed',
  cancelText = 'Stay Here',
  type = 'info'
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return (
          <div className="w-12 h-12 mx-auto mb-4 bg-warning-soft rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-warning-text" />
          </div>
        );
      case 'success':
        return (
          <div className="w-12 h-12 mx-auto mb-4 bg-success-soft rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 mx-auto mb-4 bg-primary/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 10001 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in-0 zoom-in-95 duration-200" style={{ zIndex: 10002 }}>
        {getIcon()}

        <h3 className="text-lg font-semibold text-foreground text-center mb-2">
          {title}
        </h3>

        <p className="text-muted-foreground text-center mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex gap-3 justify-center">
          <Button
            onClick={onCancel}
            variant="outline"
            className="px-6 py-2 bg-transparent border-border text-muted-foreground hover:bg-card hover:text-foreground"
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}