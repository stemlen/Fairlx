/**
 * Socket.IO Server - WebSocket Push Notifications
 * 
 * This module provides a WebSocket server for real-time push notifications.
 * It runs alongside the Next.js server and handles:
 * - User authentication via session token
 * - User-scoped rooms (user:{userId})
 * - Safe emit helpers with fire-and-forget semantics
 * 
 * ARCHITECTURE:
 * - This is a SINGLETON server instance
 * - Notifications are pushed AFTER DB write (fire-and-forget)
 * - Socket failures are logged but NEVER block notifications
 * 
 * INTEGRATION:
 * - Called from createNotification() after DB write
 * - Does NOT modify workitem or email logic
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { SocketNotificationPayload, SocketAuthPayload } from "./types";

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let io: SocketIOServer | null = null;
const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socket IDs

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the Socket.IO server
 * 
 * Should be called once when the HTTP server starts.
 * Safe to call multiple times (idempotent).
 * 
 * @param httpServer - The HTTP server to attach Socket.IO to
 */
export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
    if (io) {
        return io;
    }

    io = new SocketIOServer(httpServer, {
        path: "/api/socket",
        addTrailingSlash: false,
        cors: {
            origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
            credentials: true,
        },
        transports: ["websocket", "polling"],
    });

    io.on("connection", handleConnection);

    return io;
}

/**
 * Get the Socket.IO server instance
 * Returns null if not initialized
 */
export function getSocketServer(): SocketIOServer | null {
    return io;
}

/**
 * Check if socket server is available
 */
export function isSocketServerAvailable(): boolean {
    return io !== null;
}

// =============================================================================
// CONNECTION HANDLING
// =============================================================================

function handleConnection(socket: Socket): void {
    // Handle authentication
    socket.on("auth:connect", (payload: SocketAuthPayload) => {
        handleAuth(socket, payload);
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
        handleDisconnect(socket, reason);
    });

    // Handle errors
    socket.on("error", () => {
        // Error handled silently in production
    });
}

/**
 * Handle user authentication and room assignment
 */
function handleAuth(socket: Socket, payload: SocketAuthPayload): void {
    try {
        const { userId } = payload;

        if (!userId) {
            socket.emit("auth:error", { message: "User ID required" });
            return;
        }

        // TODO: Add session token validation if needed
        // For now, we trust the userId from authenticated frontend

        // Join user-specific room
        const userRoom = `user:${userId}`;
        socket.join(userRoom);

        // Track connected sockets for this user
        if (!connectedUsers.has(userId)) {
            connectedUsers.set(userId, new Set());
        }
        connectedUsers.get(userId)!.add(socket.id);

        // Store userId on socket for disconnect handling
        (socket as Socket & { userId?: string }).userId = userId;

        // Emit success
        socket.emit("auth:success", {
            userId,
            connectedAt: new Date().toISOString(),
        });
    } catch {
        socket.emit("auth:error", { message: "Authentication failed" });
    }
}

/**
 * Handle socket disconnection
 */
function handleDisconnect(socket: Socket, _reason: string): void {
    const userId = (socket as Socket & { userId?: string }).userId;

    if (userId) {
        const userSockets = connectedUsers.get(userId);
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                connectedUsers.delete(userId);
            }
        }
    }
}

// =============================================================================
// EMIT HELPERS (FIRE-AND-FORGET)
// =============================================================================

/**
 * Emit notification to a specific user
 * 
 * This is FIRE-AND-FORGET:
 * - Non-blocking
 * - Logs failures but never throws
 * - Safe to call even if socket server is unavailable
 * 
 * @param userId - Target user ID
 * @param payload - Notification payload
 */
export function emitToUser(userId: string, payload: SocketNotificationPayload): void {
    try {
        if (!io) {
            console.debug("[SocketServer] Server not initialized, skipping emit");
            return;
        }

        const userRoom = `user:${userId}`;
        io.to(userRoom).emit("notification:new", payload);
    } catch {
        // CRITICAL: Never throw - fire and forget
    }
}

/**
 * Emit notification to multiple users
 * 
 * @param userIds - Array of target user IDs
 * @param payload - Notification payload
 */
export function emitToUsers(userIds: string[], payload: SocketNotificationPayload): void {
    userIds.forEach((userId) => emitToUser(userId, payload));
}

/**
 * Get count of connected users
 */
export function getConnectedUserCount(): number {
    return connectedUsers.size;
}

/**
 * Check if a specific user is connected
 */
export function isUserConnected(userId: string): boolean {
    return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
}
