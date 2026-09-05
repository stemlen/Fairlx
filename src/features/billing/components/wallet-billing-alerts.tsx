"use client";

import Link from "next/link";
import { AlertTriangle, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWalletBillingAlert } from "@/features/wallet/api/use-wallet-billing-alert";

function formatUsd(amount: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Full-width warning shown under the navbar on every load/refresh
 * when the wallet is negative or the account is locked at -$20.
 */
export function WalletBillingBanner() {
    const { isLoading, balance, locked, negative, billingHref, lockThreshold } = useWalletBillingAlert();
    if (isLoading || (!locked && !negative)) return null;

    return (
        <Alert
            variant="destructive"
            className={cn(
                "rounded-none border-x-0 border-t-0",
                locked
                    ? "border-red-500/60 bg-red-500/10"
                    : "border-amber-500/50 bg-amber-500/10",
            )}
        >
            {locked ? (
                <Lock className="h-4 w-4" />
            ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <AlertTitle className={locked ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>
                {locked ? "Account locked" : "Wallet balance is negative"}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p>
                    {locked
                        ? `AI usage drove the wallet to ${formatUsd(balance)}. Accounts lock at -$${lockThreshold.toFixed(0)} overdraft. Add credits to restore access.`
                        : `Wallet balance is ${formatUsd(balance)}. The account locks at -$${lockThreshold.toFixed(0)}. Add credits to avoid interruption.`}
                </p>
                <Button asChild size="sm" variant="outline">
                    <Link href={billingHref}>Add credits</Link>
                </Button>
            </AlertDescription>
        </Alert>
    );
}

/** Compact navbar chip for negative or locked wallets. */
export function WalletBalanceChip() {
    const { isLoading, balance, locked, negative, billingHref } = useWalletBillingAlert();
    if (isLoading || (!locked && !negative)) return null;

    return (
        <Link
            href={billingHref}
            className={cn(
                "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                locked
                    ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
            title={locked ? "Account locked — add credits" : "Negative wallet balance"}
        >
            {locked ? <Lock className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {locked ? "Locked" : formatUsd(balance)}
        </Link>
    );
}
