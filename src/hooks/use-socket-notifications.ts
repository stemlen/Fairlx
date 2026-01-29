/**
 * Socket.IO Client Hook
 * 
 * React hook for connecting to the WebSocket server and receiving
 * real-time push notifications.
 * 
 * FEATURES:
 * - Automatic connection/reconnection
 * - User authentication
 * - Toast notifications for new messages
 * - Fallback to polling if socket disconnects
 * - Query invalidation for fresh data
 * 
 * USAGE:
 * ```tsx
 * const { isConnected, connectionError } = useSocketNotifications({
 *   userId: currentUser.$id,
 *   workspaceId,
 *   onNotification: (payload) => {
 *     toast(payload.title, { description: payload.message });
 *   }
 * });
 * ```
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { SocketNotificationPayload, SocketEventMap } from "@/lib/socket/types";

// =============================================================================
// TYPES
// =============================================================================

interface UseSocketNotificationsOptions {
    /** Current user ID */
    userId: string;
    /** Current workspace ID (for filtering) */
    workspaceId?: string;
    /** Callback when new notification arrives */
    onNotification?: (payload: SocketNotificationPayload) => void;
    /** Whether to enable socket connection (default: true) */
    enabled?: boolean;
    /** Polling interval fallback in ms (default: 30000) */
    pollingIntervalMs?: number;
}

interface UseSocketNotificationsReturn {
    /** Whether socket is currently connected */
    isConnected: boolean;
    /** Whether authenticated with server */
    isAuthenticated: boolean;
    /** Connection error if any */
    connectionError: Error | null;
    /** Last notification received */
    lastNotification: SocketNotificationPayload | null;
    /** Manually disconnect */
    disconnect: () => void;
    /** Manually reconnect */
    reconnect: () => void;
}

// =============================================================================
// SINGLETON SOCKET INSTANCE
// =============================================================================

let socketInstance: Socket | null = null;

function getSocket(): Socket {
    if (!socketInstance) {
        const socketUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        socketInstance = io(socketUrl, {
            path: "/api/socket",
            transports: ["websocket", "polling"],
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
    }
    return socketInstance;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useSocketNotifications({
    userId,
    workspaceId,
    onNotification,
    enabled = true,
    pollingIntervalMs = 30000,
}: UseSocketNotificationsOptions): UseSocketNotificationsReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [connectionError, setConnectionError] = useState<Error | null>(null);
    const [lastNotification, setLastNotification] = useState<SocketNotificationPayload | null>(null);

    const queryClient = useQueryClient();
    const callbackRef = useRef(onNotification);
    callbackRef.current = onNotification;
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Start polling fallback
    const startPolling = useCallback(() => {
        if (pollingRef.current) return;

        pollingRef.current = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unread-count"] });
        }, pollingIntervalMs);
    }, [queryClient, pollingIntervalMs]);

    // Stop polling
    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    // Disconnect handler
    const disconnect = useCallback(() => {
        const socket = getSocket();
        socket.disconnect();
        setIsConnected(false);
        setIsAuthenticated(false);
    }, []);

    // Reconnect handler
    const reconnect = useCallback(() => {
        const socket = getSocket();
        if (!socket.connected) {
            socket.connect();
        }
    }, []);

    useEffect(() => {
        if (!enabled || !userId) {
            return;
        }

        const socket = getSocket();

        // Connection handlers
        const handleConnect = () => {
            setIsConnected(true);
            setConnectionError(null);
            stopPolling();

            // Authenticate with server
            socket.emit("auth:connect", { userId });
        };

        const handleDisconnect = (_reason: string) => {
            setIsConnected(false);
            setIsAuthenticated(false);

            // Start polling fallback
            startPolling();
        };

        const handleConnectError = (error: Error) => {
            setConnectionError(error);
            setIsConnected(false);
            startPolling();
        };

        // Auth handlers
        const handleAuthSuccess = (_data: SocketEventMap["auth:success"]) => {
            setIsAuthenticated(true);
        };

        const handleAuthError = (data: SocketEventMap["auth:error"]) => {
            setConnectionError(new Error(data.message));
        };

        // Notification handler
        const handleNotification = (payload: SocketNotificationPayload) => {
            // Optional: Filter by workspace
            if (workspaceId && payload.workspaceId !== workspaceId) {
                return;
            }

            setLastNotification(payload);

            // Invalidate queries for fresh data
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unread-count"] });

            // Trigger callback
            if (callbackRef.current) {
                callbackRef.current(payload);
            }
        };

        // Attach handlers
        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);
        socket.on("auth:success", handleAuthSuccess);
        socket.on("auth:error", handleAuthError);
        socket.on("notification:new", handleNotification);

        // Connect
        if (!socket.connected) {
            socket.connect();
        } else {
            // Already connected, authenticate
            socket.emit("auth:connect", { userId });
        }

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleConnectError);
            socket.off("auth:success", handleAuthSuccess);
            socket.off("auth:error", handleAuthError);
            socket.off("notification:new", handleNotification);
            stopPolling();
        };
    }, [userId, workspaceId, enabled, queryClient, startPolling, stopPolling]);

    return {
        isConnected,
        isAuthenticated,
        connectionError,
        lastNotification,
        disconnect,
        reconnect,
    };
}
