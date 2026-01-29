"use client";

import { useState, useCallback, useEffect } from "react";
import { CreditCard, DollarSign, FileText, ExternalLink, Calendar, Loader2, CheckCircle2, AlertTriangle, Info, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import Script from "next/script";

import { cn } from "@/lib/utils";
import { useGetOrganization } from "../api/use-get-organization";
import { useGetOrgMembers } from "../api/use-get-org-members";
import { useUpdateOrganization } from "../api/use-update-organization";
import { useGetInvoices } from "@/features/usage/api";

// Billing API hooks
import {
    useGetBillingAccount,
    useGetBillingStatus,
    useGetCheckoutOptions,
    useUpdatePaymentMethod,
    useSetupBilling
} from "@/features/billing/api";
import { BillingStatus, BillingAccountType, RazorpayCheckoutOptions } from "@/features/billing/types";
import { BillingWarningBanner } from "@/features/billing/components/billing-warning-banner";
import { useCurrentUserOrgPermissions } from "@/features/org-permissions/api/use-current-user-permissions";
import { OrgPermissionKey } from "@/features/org-permissions/types";
import { client } from "@/lib/rpc";



interface OrganizationBillingSettingsProps {
    organizationId: string;
    organizationName: string;
}

export function OrganizationBillingSettings({
    organizationId,
    organizationName,
}: OrganizationBillingSettingsProps) {
    const { data: organization, isLoading: isOrgLoading } = useGetOrganization({ orgId: organizationId });
    const { data: membersDoc } = useGetOrgMembers({ organizationId });
    const { data: invoicesDoc, isLoading: isInvoicesLoading } = useGetInvoices({
        organizationId,
        limit: 10
    });
    const { mutate: updateOrganization } = useUpdateOrganization();

    // Permission check - BILLING_MANAGE required to edit
    const { hasPermission: hasOrgPermission } = useCurrentUserOrgPermissions({ orgId: organizationId });
    const canManageBilling = hasOrgPermission(OrgPermissionKey.BILLING_MANAGE);

    // Billing hooks
    const { data: billingAccountData, isLoading: isBillingLoading } = useGetBillingAccount({
        organizationId,
        enabled: !!organizationId
    });
    const { data: billingStatus } = useGetBillingStatus({
        organizationId,
        enabled: !!organizationId
    });
    const [billingPhone, setBillingPhone] = useState("");
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"upi" | "debitcard" | undefined>(undefined);

    // Checkout options - requires phone for e-Mandate
    // Note: We call the API directly in handleAddPaymentMethod for fresh params
    useGetCheckoutOptions({
        organizationId,
        phone: billingPhone,
        paymentMethod: selectedPaymentMethod,
        enabled: false // Only fetch when needed
    });

    const { mutateAsync: updatePaymentMethod } = useUpdatePaymentMethod();
    const { mutateAsync: setupBilling } = useSetupBilling();

    const [billingEmailValue, setBillingEmailValue] = useState("");
    const [alternativeEmailValue, setAlternativeEmailValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [showPhoneInput, setShowPhoneInput] = useState(false);

    // Sync state with organization data
    useEffect(() => {
        if (organization) {
            try {
                const settings = organization.billingSettings ? JSON.parse(organization.billingSettings) : {};
                setBillingEmailValue(settings.primaryEmail || "");
                setAlternativeEmailValue(settings.alternativeEmail || "");
            } catch {
                // Failed to parse billing settings
            }
        }
    }, [organization]);

    // Find organization owner email
    const ownerEmail = membersDoc?.documents.find(m => m.role === "OWNER")?.email;

    // Billing account data
    const billingAccount = billingAccountData?.data;
    const hasPaymentMethod = billingAccountData?.hasPaymentMethod || false;

    const invoices = invoicesDoc?.documents || [];
    const isLoading = isOrgLoading || isBillingLoading;

    // Payment method display
    const paymentMethodDisplay = billingAccount?.paymentMethodBrand
        ? `${billingAccount.paymentMethodBrand} ending in ${billingAccount.paymentMethodLast4}`
        : billingAccount?.paymentMethodType || "Card";

    // Handler for save billing settings - must be defined before any conditional returns
    const handleSaveBillingSettings = useCallback(async () => {
        if (!organizationId) {
            toast.error("Organization ID is required");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (billingEmailValue && !emailRegex.test(billingEmailValue)) {
            toast.error("Please enter a valid primary email address");
            return;
        }

        if (alternativeEmailValue && !emailRegex.test(alternativeEmailValue)) {
            toast.error("Please enter a valid alternative email address");
            return;
        }

        setIsSaving(true);

        const settings = {
            primaryEmail: billingEmailValue || ownerEmail,
            alternativeEmail: alternativeEmailValue
        };

        updateOrganization({
            organizationId,
            billingSettings: JSON.stringify(settings)
        }, {
            onSuccess: () => {
                toast.success("Billing settings updated successfully!");
                setIsSaving(false);
            },
            onError: () => {
                toast.error("Failed to save billing settings");
                setIsSaving(false);
            }
        });
    }, [organizationId, billingEmailValue, alternativeEmailValue, ownerEmail, updateOrganization]);

    // Handler for add/update payment method - must be defined before any conditional returns
    const handleAddPaymentMethod = useCallback(async (paymentMethodOverride?: "upi" | "debitcard") => {
        if (!organizationId) {
            toast.error("Organization ID is required");
            return;
        }

        // Phone is REQUIRED for Razorpay e-Mandate recurring payments
        if (!billingPhone || billingPhone.length < 10) {
            setShowPhoneInput(true);
            toast.error("Please enter a valid phone number for auto-debit setup");
            return;
        }

        if (!isScriptLoaded) {
            toast.error("Payment system not ready. Please refresh the page.");
            return;
        }

        // Use the override if provided, otherwise fall back to state
        const methodToUse = paymentMethodOverride || selectedPaymentMethod;

        // Update state for UI display
        if (paymentMethodOverride) {
            setSelectedPaymentMethod(paymentMethodOverride);
        }

        setIsAddingPayment(true);

        try {
            // First ensure billing account exists
            if (!billingAccountData?.data) {
                try {
                    await setupBilling({
                        json: {
                            type: BillingAccountType.ORG,
                            organizationId,
                            billingEmail: billingEmailValue || organization?.email || ownerEmail || "",
                            contactName: organization?.name || "Organization Admin",
                            contactPhone: billingPhone, // Required for e-Mandate
                        }
                    });
                } catch {
                    toast.error("Failed to initialize billing account. Please contact support.");
                    setIsAddingPayment(false);
                    return;
                }
            }

            // Fetch checkout options directly with the correct payment method
            // Build params for the API call
            const params: {
                phone: string;
                organizationId?: string;
                paymentMethod?: "upi" | "debitcard" | "netbanking";
            } = {
                phone: billingPhone,
            };
            if (organizationId) params.organizationId = organizationId;
            if (methodToUse) params.paymentMethod = methodToUse;

            // Call the API directly instead of using refetch to ensure fresh params
            const response = await client.api.billing["checkout-options"].$get({
                query: params,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error((errorData as { error?: string }).error || "Failed to get checkout options");
            }

            const checkoutResult = await response.json() as { data: RazorpayCheckoutOptions };
            const checkoutOptions = checkoutResult.data;

            if (!checkoutOptions) {
                toast.error("Failed to initialize payment configuration. Please try again.");
                setIsAddingPayment(false);
                return;
            }

            // Open Razorpay checkout
            // Open Razorpay checkout
            const razorpayOptions: RazorpayCheckoutConfig = {
                key: checkoutOptions.key,
                subscription_id: checkoutOptions.subscriptionId,
                order_id: checkoutOptions.orderId, // Required for e-Mandate
                recurring: checkoutOptions.recurring, // Required for e-Mandate
                // CRITICAL: method restriction tells Razorpay which payment UI to show
                // This fixes the bug where UPI AutoPay was opening Card modal
                method: checkoutOptions.method,
                name: checkoutOptions.name,
                description: checkoutOptions.description,
                prefill: {
                    name: checkoutOptions.prefill.name,
                    email: checkoutOptions.prefill.email,
                    contact: checkoutOptions.prefill.contact,
                },
                theme: {
                    color: checkoutOptions.theme.color,
                },
                handler: async (response: RazorpayResponse) => {
                    // Payment completed - update payment method
                    try {
                        await updatePaymentMethod({
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySubscriptionId: response.razorpay_subscription_id,
                            razorpaySignature: response.razorpay_signature,
                        });
                        // Success toast is handled by the mutation
                    } catch {
                        toast.error("Payment recorded but failed to update. Please contact support.");
                    }
                    setIsAddingPayment(false);
                },
                modal: {
                    ondismiss: () => {
                        setIsAddingPayment(false);
                    },
                },
            };

            const razorpay = new window.Razorpay(razorpayOptions);
            razorpay.open();
        } catch {
            toast.error("Failed to initialize payment. Please try again.");
            setIsAddingPayment(false);
        }
    }, [organizationId, isScriptLoaded, updatePaymentMethod, billingAccountData?.data, billingEmailValue, organization?.email, organization?.name, ownerEmail, setupBilling, billingPhone, selectedPaymentMethod]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading billing settings...</p>
            </div>
        );
    }

    return (
        <>
            {/* Load Razorpay Script */}
            <Script
                src="https://checkout.razorpay.com/v1/checkout.js"
                onLoad={() => setIsScriptLoaded(true)}
                onError={() => {
                    // Failed to load Razorpay script
                }}
            />

            <div className="space-y-6">
                {/* Billing Warning Banner - shows during grace period */}
                {billingStatus?.status === BillingStatus.DUE && (
                    <BillingWarningBanner
                        billingStatus={BillingStatus.DUE}
                        daysUntilSuspension={billingStatus.daysUntilSuspension}
                        organizationId={organizationId}
                    />
                )}

                {/* Billing Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Billing Overview
                        </CardTitle>
                        <CardDescription>
                            Organization-level billing information and settings
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Billing Status Alert */}
                        {billingStatus?.status === BillingStatus.SUSPENDED && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    <strong>Account Suspended</strong> - Your organization has been suspended due to an unpaid invoice.
                                    Please update your payment method below to restore access.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Billing Timeline - Item 4.6 */}
                        <div className="rounded-lg border p-5 bg-blue-50/50 dark:bg-blue-950/20 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <Calendar className="h-16 w-16" />
                            </div>

                            <h4 className="text-sm font-semibold flex items-center gap-2 mb-4 text-blue-700 dark:text-blue-400">
                                <Calendar className="h-4 w-4" />
                                Billing Lifecycle
                            </h4>

                            <div className="relative pl-6 space-y-6">
                                {/* Vertical Line Connector */}
                                <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-blue-100 dark:bg-blue-900/50" />

                                {/* Personal Phase */}
                                <div className="relative">
                                    <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-950 bg-slate-300 dark:bg-slate-700 z-10" />
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-slate-900 dark:text-slate-100">Personal Account Usage</span>
                                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 uppercase tracking-wider font-bold bg-white/50 dark:bg-black/20">Historic</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            All activity prior to organization creation. Billed directly to your personal payment method.
                                        </p>
                                    </div>
                                </div>

                                {/* Organization Phase */}
                                <div className="relative">
                                    <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-950 bg-blue-600 z-10 shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-blue-700 dark:text-blue-400">Organization Managed Billing</span>
                                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 uppercase tracking-wider font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">Active</Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-blue-600/80 dark:text-blue-400/80 font-medium">
                                            <span>Started on {organization?.billingStartAt ? format(new Date(organization.billingStartAt), "PPP") : "Creation"}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            All shared workspaces and team activity are consolidated into this organization&apos;s billing cycle.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-blue-100 dark:border-blue-900/40 flex items-center justify-between">
                                <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 italic">
                                    * The transition occurred when your account was converted to an organization.
                                </p>
                                <Button variant="ghost" size="sm" asChild className="text-blue-600 dark:text-blue-400 font-semibold h-7 px-2 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                                    <Link href="/organization/usage">
                                        View Detailed Usage
                                        <ExternalLink className="ml-1.5 h-3 w-3" />
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Billing Entity</Label>
                                <div className="flex items-center gap-2">
                                    <Input value={organization?.name || organizationName} disabled className="flex-1" />
                                    <Badge variant="default">Organization</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    All workspaces in this organization share billing
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Billing Status</Label>
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant={
                                            billingStatus?.status === BillingStatus.ACTIVE ? "default" :
                                                billingStatus?.status === BillingStatus.DUE ? "secondary" :
                                                    "destructive"
                                        }
                                        className={cn(
                                            billingStatus?.status === BillingStatus.ACTIVE && "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
                                            billingStatus?.status === BillingStatus.DUE && "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400"
                                        )}
                                    >
                                        {billingStatus?.status || "ACTIVE"}
                                    </Badge>
                                    {billingStatus?.status === BillingStatus.DUE && billingStatus.daysUntilSuspension !== undefined && (
                                        <span className="text-xs text-orange-600">
                                            ({billingStatus.daysUntilSuspension} days until suspension)
                                        </span>
                                    )}
                                </div>
                                {billingAccount?.billingCycleEnd && (
                                    <p className="text-xs text-muted-foreground">
                                        Next billing: {format(new Date(billingAccount.billingCycleEnd), "PPP")}
                                    </p>
                                )}
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="billingEmail">Primary Billing Email</Label>
                                <Input
                                    id="billingEmail"
                                    type="email"

                                    value={billingEmailValue}
                                    onChange={(e) => setBillingEmailValue(e.target.value)}
                                    placeholder={ownerEmail || "owner@example.com"}
                                    disabled={isSaving || !canManageBilling}
                                />
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    {billingEmailValue ? (
                                        <span>Custom billing email active</span>
                                    ) : (
                                        <>
                                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 uppercase font-bold">Default</Badge>
                                            <span>Using owner: {ownerEmail || "loading..."}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="alternativeEmail">Alternative Billing Email (Optional)</Label>
                                <Input
                                    id="alternativeEmail"
                                    type="email"
                                    value={alternativeEmailValue}
                                    onChange={(e) => setAlternativeEmailValue(e.target.value)}
                                    placeholder="finance@company.com"
                                    disabled={isSaving || !canManageBilling}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Secondary contact for billing notifications
                                </p>
                            </div>
                        </div>

                        <Button onClick={handleSaveBillingSettings} disabled={isSaving || !canManageBilling}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Billing Settings"
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Payment Method */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Payment Method
                        </CardTitle>
                        <CardDescription>
                            Manage your organization&apos;s payment method for auto-billing
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Auto-debit explanation */}
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                <strong>How auto-billing works:</strong> Your payment method will be charged automatically
                                at the end of each billing cycle based on your usage. We never store your card details directly.
                            </AlertDescription>
                        </Alert>

                        {hasPaymentMethod ? (
                            <div className="space-y-4">
                                {/* Phone Input - Required for updating payment method */}
                                {showPhoneInput && (
                                    <div className="p-4 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30">
                                        <Label htmlFor="update-billing-phone" className="text-sm font-medium mb-2 block">
                                            Phone Number <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="update-billing-phone"
                                            type="tel"
                                            placeholder="+91 9876543210"
                                            value={billingPhone}
                                            onChange={(e) => setBillingPhone(e.target.value)}
                                            className={`${!billingPhone || billingPhone.length < 10 ? 'border-red-500' : ''}`}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Required for auto-debit authorization
                                        </p>
                                    </div>
                                )}

                                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                                        </div>
                                        <div>
                                            <div className="font-medium">{paymentMethodDisplay}</div>
                                            <div className="text-sm text-muted-foreground">
                                                {billingAccount?.lastPaymentAt
                                                    ? `Last payment: ${format(new Date(billingAccount.lastPaymentAt), "PPP")}`
                                                    : "Auto-billing enabled"
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant={showPhoneInput && billingPhone && billingPhone.length >= 10 ? "primary" : "outline"}
                                        size="sm"
                                        onClick={() => handleAddPaymentMethod()}
                                        disabled={isAddingPayment || !canManageBilling || (showPhoneInput && (!billingPhone || billingPhone.length < 10))}
                                    >
                                        {isAddingPayment ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : showPhoneInput ? (
                                            "Continue"
                                        ) : (
                                            "Update"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="border rounded-lg border-dashed p-6">
                                {/* Phone Input - Required for e-Mandate */}
                                <div className="mb-6">
                                    <Label htmlFor="billing-phone" className="text-sm font-medium mb-2 block">
                                        Phone Number <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="billing-phone"
                                            type="tel"
                                            placeholder="+91 9876543210"
                                            value={billingPhone}
                                            onChange={(e) => setBillingPhone(e.target.value)}
                                            className={`flex-1 ${showPhoneInput && (!billingPhone || billingPhone.length < 10) ? 'border-red-500' : ''}`}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Required for auto-debit authorization (Razorpay mandate)
                                    </p>
                                </div>

                                <div className="text-center py-4">
                                    <p className="text-muted-foreground mb-4">
                                        Choose your preferred auto-debit method
                                    </p>

                                    {/* Payment Method Selection Buttons */}
                                    <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
                                        {/* UPI AutoPay Button */}
                                        <Button
                                            onClick={() => handleAddPaymentMethod("upi")}
                                            disabled={isAddingPayment || !isScriptLoaded || !billingPhone || billingPhone.length < 10 || !canManageBilling}
                                            size="lg"
                                            variant={selectedPaymentMethod === "upi" ? "primary" : "outline"}
                                            className="min-w-[180px]"
                                        >
                                            {isAddingPayment && selectedPaymentMethod === "upi" ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Setting up...
                                                </>
                                            ) : (
                                                <>
                                                    <Smartphone className="mr-2 h-4 w-4" />
                                                    UPI AutoPay
                                                </>
                                            )}
                                        </Button>

                                        {/* Card Auto-Debit Button */}
                                        <Button
                                            onClick={() => handleAddPaymentMethod("debitcard")}
                                            disabled={isAddingPayment || !isScriptLoaded || !billingPhone || billingPhone.length < 10 || !canManageBilling}
                                            size="lg"
                                            variant={selectedPaymentMethod === "debitcard" ? "primary" : "outline"}
                                            className="min-w-[180px]"
                                        >
                                            {isAddingPayment && selectedPaymentMethod === "debitcard" ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Setting up...
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="mr-2 h-4 w-4" />
                                                    Card Auto-Debit
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    <p className="text-xs text-muted-foreground mt-3">
                                        Payments processed securely by Razorpay
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Invoice History */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="h-5 w-5" />
                                    Invoice History
                                </CardTitle>
                                <CardDescription>
                                    View and download past invoices
                                </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/organization/settings/billing?tab=invoices`}>
                                    View All Invoices
                                    <ExternalLink className="ml-2 h-3 w-3" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {isInvoicesLoading ? (
                                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <p className="text-xs text-muted-foreground">Loading invoices...</p>
                                </div>
                            ) : invoices.length === 0 ? (
                                <div className="text-center py-10 border rounded-lg border-dashed">
                                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                    <p className="text-sm text-muted-foreground">No invoices found for this organization yet.</p>
                                    <p className="text-xs text-muted-foreground mt-1">Invoices are generated at the end of each billing cycle.</p>
                                </div>
                            ) : (
                                invoices.map((invoice) => (
                                    <div
                                        key={invoice.$id}
                                        className="flex items-center justify-between p-3 rounded-lg border"
                                    >
                                        <div className="flex items-center gap-4">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">{invoice.invoiceId}</div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(invoice.createdAt), "PPP")}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="font-semibold">
                                                    {new Intl.NumberFormat("en-IN", {
                                                        style: "currency",
                                                        currency: "INR",
                                                    }).format(invoice.totalCost)}
                                                </div>
                                                <Badge
                                                    variant={invoice.status === 'paid' ? 'default' : 'outline'}
                                                    className={cn(
                                                        "text-[10px] h-4 px-1.5 uppercase",
                                                        invoice.status === 'paid' && "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
                                                        invoice.status === 'draft' && "bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800"
                                                    )}
                                                >
                                                    {invoice.status}
                                                </Badge>
                                            </div>
                                            <Button variant="ghost" size="sm">
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Usage Dashboard Link */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
                    <CardContent className="py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold">View Detailed Usage</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Monitor your organization&apos;s usage metrics and costs
                                </p>
                            </div>
                            <Button asChild>
                                <Link href="/organization/usage">
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    Usage Dashboard
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
