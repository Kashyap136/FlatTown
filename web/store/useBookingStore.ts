'use client';

/**
 * Booking funnel state.
 *
 * Drives the four-step booking wizard (details → visit slot → token → documents)
 * and remembers the created booking + gateway order so the Razorpay (or clearly
 * labelled simulated) payment can be completed without re-fetching.
 */

import { create } from 'zustand';

import type { Booking, SiteVisit, TokenOrderResponse } from '../lib/types';

export type BookingStep = 'details' | 'visit' | 'token' | 'documents' | 'done';

export interface BuyerDetails {
  fullName: string;
  email: string;
  phone: string;
  requirements: string;
  loanAssistanceRequired: boolean;
  agentId?: string;
}

export interface VisitSlot {
  date: string;
  time: string;
}

interface PendingPayment {
  orderId: string;
  amount: number;
  gateway: 'razorpay' | 'mock';
  simulated: boolean;
  keyId?: string;
  mockSignature?: string;
}

interface BookingState {
  flatId: string | null;
  step: BookingStep;
  details: BuyerDetails;
  slot: VisitSlot | null;
  tokenAmount: number;
  booking: Booking | null;
  payment: PendingPayment | null;
  visit: SiteVisit | null;
  documents: Array<{ type: string; file: File | null }>;
  /** Set when a step fails so the UI can show an inline retry. */
  error: string | null;
  busy: boolean;

  start: (flatId: string, tokenAmount: number) => void;
  setStep: (step: BookingStep) => void;
  setDetails: (details: Partial<BuyerDetails>) => void;
  setSlot: (slot: VisitSlot | null) => void;
  setTokenAmount: (amount: number) => void;
  setBooking: (booking: Booking) => void;
  setPayment: (payment: PendingPayment | null) => void;
  setVisit: (visit: SiteVisit | null) => void;
  addDocument: (type: string, file: File) => void;
  removeDocument: (type: string) => void;
  setError: (error: string | null) => void;
  setBusy: (busy: boolean) => void;
  reset: () => void;
}

const EMPTY_DETAILS: BuyerDetails = {
  fullName: '',
  email: '',
  phone: '',
  requirements: '',
  loanAssistanceRequired: false,
};

export const DEFAULT_DOCUMENT_TYPES = [
  { type: 'aadhaar', label: 'Aadhaar card', hint: 'PDF or image, up to 5 MB' },
  { type: 'pan', label: 'PAN card', hint: 'PDF or image, up to 5 MB' },
  { type: 'loan_approval', label: 'Loan approval letter', hint: 'Required only if you asked for loan assistance' },
];

export const useBookingStore = create<BookingState>((set) => ({
  flatId: null,
  step: 'details',
  details: EMPTY_DETAILS,
  slot: null,
  tokenAmount: 50_000,
  booking: null,
  payment: null,
  visit: null,
  documents: [],
  error: null,
  busy: false,

  start: (flatId, tokenAmount) =>
    set({
      flatId,
      tokenAmount,
      step: 'details',
      details: EMPTY_DETAILS,
      slot: null,
      booking: null,
      payment: null,
      visit: null,
      documents: [],
      error: null,
      busy: false,
    }),

  setStep: (step) => set({ step, error: null }),
  setDetails: (details) => set((state) => ({ details: { ...state.details, ...details } })),
  setSlot: (slot) => set({ slot }),
  setTokenAmount: (tokenAmount) => set({ tokenAmount }),
  setBooking: (booking) => set({ booking }),
  setPayment: (payment) => set({ payment }),
  setVisit: (visit) => set({ visit }),
  addDocument: (type, file) =>
    set((state) => ({
      documents: [...state.documents.filter((d) => d.type !== type), { type, file }],
    })),
  removeDocument: (type) => set((state) => ({ documents: state.documents.filter((d) => d.type !== type) })),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
  reset: () =>
    set({
      flatId: null,
      step: 'details',
      details: EMPTY_DETAILS,
      slot: null,
      booking: null,
      payment: null,
      visit: null,
      documents: [],
      error: null,
      busy: false,
    }),
}));

/** Seeds the buyer details from the signed-in profile. */
export const prefillDetails = (details: BuyerDetails, user: { name: string; email: string; phone: string }): BuyerDetails => ({
  ...details,
  fullName: details.fullName || user.name,
  email: details.email || user.email,
  phone: details.phone || user.phone,
});

/** Maps a created token order onto the store. */
export const applyTokenOrder = (
  response: TokenOrderResponse,
  set: (partial: Partial<BookingState>) => void,
): void => {
  set({
    booking: response.booking,
    payment: {
      orderId: response.payment.orderId,
      amount: response.payment.amount,
      gateway: response.payment.gateway,
      simulated: response.payment.simulated ?? response.payment.gateway === 'mock',
      keyId: response.payment.keyId,
      mockSignature: response.payment.mockSignature,
    },
  });
};