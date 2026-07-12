import { create } from "zustand";

export type ToastVariant = "success" | "danger" | "info" | "warn";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

/** Minimal transient-toast store. One-at-a-time in practice; auto-dismiss is
 *  driven by the Toast component so the store stays timer-free and testable. */
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (message, variant = "info") => {
    const id = `toast-${counter++}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
