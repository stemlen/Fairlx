"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary for Onboarding Flow
 * 
 * Catches React errors during onboarding and provides a recovery UI.
 * Users can retry onboarding or reset their state.
 */
export class OnboardingErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
        // Error handled by error boundary
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    handleReset = () => {
        // Clear onboarding state from localStorage
        if (typeof window !== "undefined") {
            localStorage.removeItem("fairlx_onboarding_state");
        }
        // Reload page to start fresh
        window.location.href = "/onboarding";
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex items-center justify-center min-h-screen p-6 bg-muted/30">
                    <Card className="w-full max-w-md">
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                                <AlertTriangle className="h-7 w-7 text-destructive" />
                            </div>
                            <CardTitle className="text-xl">Something Went Wrong</CardTitle>
                            <CardDescription>
                                We encountered an error during onboarding. Don&apos;t worry, your progress is saved.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {this.state.error && (
                                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                    <code>{this.state.error.message}</code>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={this.handleReset}
                                >
                                    Start Over
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={this.handleRetry}
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Try Again
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
