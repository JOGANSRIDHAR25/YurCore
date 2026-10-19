
"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState } from "react";
import { Receipt, Download, X, Loader2 } from "lucide-react";

type InvoiceData = {
    doctorFeePaise: number;
    totalPaise: number;
    paymentMethod?: "cash" | "online" | null;
};

const PAYMENT_METHOD_LABEL: Record<"cash" | "online", string> = {
    cash: "Cash",
    online: "Online",
};

type InvoiceDialogProps = {
    consultationId: string;
    patientName: string;
    doctorName: string;
    invoiceDate: string;
};

const formatRupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export function InvoiceDialog({ consultationId, patientName, doctorName, invoiceDate }: InvoiceDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);

    const handleOpen = async () => {
        setOpen(true);
        if (invoice) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/consultations/${consultationId}/invoice-data`);
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Failed to load invoice");
            setInvoice(json.data);
        } catch (e: any) {
            setError(e.message || "Failed to load invoice");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={handleOpen}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold rounded-xl shadow-sm transition-all"
            >
                <Receipt className="w-4 h-4" />
                Invoice
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-indigo-500" />
                                Bill Invoice
                            </h2>
                            <div className="flex items-center gap-2">
                                <a
                                    href={`/api/consultations/${consultationId}/invoice`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Download Invoice PDF"
                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={() => setOpen(false)}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {loading && (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                    <p className="text-sm font-medium">Loading invoice…</p>
                                </div>
                            )}

                            {!loading && error && (
                                <div className="text-center py-16">
                                    <p className="text-sm font-semibold text-rose-600">{error}</p>
                                </div>
                            )}

                            {!loading && !error && invoice && (
                                <>
                                    {/* Invoice header */}
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <p className="text-lg font-bold text-emerald-600">{SITE_NAME}</p>
                                            <p className="text-xs text-slate-500">India's First AYUSH Digital Health Platform</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-slate-900">{doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`}</p>
                                            <p className="text-xs text-slate-500">{invoiceDate}</p>
                                        </div>
                                    </div>

                                    <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                                        <div className="p-4 bg-slate-50">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Billed To</p>
                                            <p className="text-sm font-semibold text-slate-900">{patientName}</p>
                                        </div>

                                        <div className="p-4 bg-slate-50">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Method</p>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {invoice.paymentMethod ? `Payment via ${PAYMENT_METHOD_LABEL[invoice.paymentMethod]}` : "—"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Charges table */}
                                    <div className="overflow-hidden rounded-xl border border-slate-200 mb-6">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                    <th className="p-3">Description</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                <tr>
                                                    <td className="p-3">
                                                        <p className="text-sm font-medium text-slate-900">Doctor Consultation Fee</p>
                                                        <p className="text-xs text-slate-500">{doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`}</p>
                                                    </td>
                                                    <td className="p-3 text-right text-sm text-slate-900">{formatRupees(invoice.doctorFeePaise)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Totals */}
                                    <div className="mb-2">
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                                            <span className="text-base font-bold text-slate-900">Grand Total</span>
                                            <span className="text-lg font-bold text-emerald-600">{formatRupees(invoice.totalPaise)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}