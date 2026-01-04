"use client";

import { useState } from "react";
import { CreditCard, DollarSign, FileText, ExternalLink, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { useEffect } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useGetOrganization } from "../api/use-get-organization";
import { useGetOrgMembers } from "../api/use-get-org-members";
import { useUpdateOrganization } from "../api/use-update-organization";
import { useGetInvoices } from "@/features/usage/api";

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

    const [billingEmailValue, setBillingEmailValue] = useState("");
    const [alternativeEmailValue, setAlternativeEmailValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingPayment, setIsAddingPayment] = useState(false);

    // Sync state with organization data
    useEffect(() => {
        if (organization) {
            try {
                const settings = organization.billingSettings ? JSON.parse(organization.billingSettings) : {};
                setBillingEmailValue(settings.primaryEmail || "");
                setAlternativeEmailValue(settings.alternativeEmail || "");
            } catch (e) {
                console.error("Failed to parse billing settings", e);
            }
        }
    }, [organization]);

    // Find organization owner email
    const ownerEmail = membersDoc?.documents.find(m => m.role === "OWNER")?.email;

    const hasPaymentMethod = false; // Mock for now

    const invoices = invoicesDoc?.documents || [];
    const isLoading = isOrgLoading; // Main page loading is still just org loading

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading billing settings...</p>
            </div>
        );
    }

    // Issue 9: Handler for save billing settings
    const handleSaveBillingSettings = async () => {
        if (!organizationId) {
            toast.error("Organization ID is required");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Validate primary email if it was overridden/set
        if (billingEmailValue && !emailRegex.test(billingEmailValue)) {
            toast.error("Please enter a valid primary email address");
            return;
        }

        // Validate alternative email if provided
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
            onError: (error) => {
                console.error("Failed to save billing settings:", error);
                toast.error("Failed to save billing settings");
                setIsSaving(false);
            }
        });
    };

    // Issue 9: Handler for add payment method
    const handleAddPaymentMethod = async () => {
        if (!organizationId) {
            toast.error("Organization ID is required");
            return;
        }

        setIsAddingPayment(true);
        try {
            // TODO: Replace with actual payment provider integration (Stripe, etc.)
            toast.info("Payment method integration is not yet implemented.");
        } catch (error) {
            console.error("Failed to add payment method:", error);
            toast.error("Failed to add payment method");
        } finally {
            setIsAddingPayment(false);
        }
    };

    return (
        <div className="space-y-6">
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
                            <Label>Organization ID</Label>
                            <Input value={organizationId} disabled className="font-mono text-sm" />
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
                                disabled={isSaving}
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
                                disabled={isSaving}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Secondary contact for billing notifications
                            </p>
                        </div>
                    </div>

                    <Button onClick={handleSaveBillingSettings} disabled={isSaving}>
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
                        Manage your organization&apos;s payment method
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {hasPaymentMethod ? (
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <div className="font-medium">Visa ending in 4242</div>
                                    <div className="text-sm text-muted-foreground">Expires 12/2025</div>
                                </div>
                            </div>
                            <Button variant="outline" size="sm">Update</Button>
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground mb-4">
                                No payment method configured
                            </p>
                            <Button onClick={handleAddPaymentMethod} disabled={isAddingPayment}>
                                {isAddingPayment ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    "Add Payment Method"
                                )}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2">
                                Add a payment method to enable automatic billing
                            </p>
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
                            <a href="#">
                                View All Invoices
                                <ExternalLink className="ml-2 h-3 w-3" />
                            </a>
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
                                                {new Intl.NumberFormat("en-US", {
                                                    style: "currency",
                                                    currency: "USD",
                                                }).format(invoice.totalCost)}
                                            </div>
                                            <Badge
                                                variant={invoice.status === 'paid' ? 'default' : 'outline'}
                                                className={cn(
                                                    "text-[10px] h-4 px-1.5 uppercase",
                                                    invoice.status === 'paid' && "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
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
    );
}
