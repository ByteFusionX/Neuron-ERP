import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { verifyAndExtractOid } from "../common/utils/extractToken";
import { getEmployeeData } from "../common/utils/util";
import ScanSession from "../models/scanSession.model";

export const connectedSockets = {};

let ioRef: Server | null = null;

/** Force-disconnect every socket of a user (sign out everywhere, block, delete). */
export const disconnectUserSockets = (userId: any) => {
    const id = String(userId);
    if (!ioRef) return;
    ioRef.to(id).emit('auth_error', { error: 'Session revoked', message: 'Session revoked' });
    ioRef.in(id).disconnectSockets(true);
    delete connectedSockets[id];
};

export const socketConnection = async (socketIo:Server) => {
    try {
        let io = socketIo
        ioRef = socketIo;

        io = socketIo;

        io.on("connection", (socket) => {
            console.log("New client connected");

            socket.on("disconnect", () => {
                console.log("Client disconnected");
                for (const [userId, socketId] of Object.entries(connectedSockets)) {
                    if (socketId === socket.id) {
                        delete connectedSockets[userId];
                        break;
                    }
                }
            })

            socket.on('auth', async (token) => {
                try {
                    // The client sends the app session token (issued after Azure AD login); fall back to an Azure token.
                    let identity: any = null;
                    try {
                        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'] });
                        if (decoded?.id) identity = { id: decoded.id, employeeId: decoded.employeeId };
                    } catch {
                        const oid = await verifyAndExtractOid(token);
                        if (oid) identity = { oid };
                    }
                    if (!identity) {
                        socket.emit('auth_error', { error: 'Authentication failed', message: 'Invalid token' });
                        return socket.disconnect();
                    }
                    const employeeData = await getEmployeeData(identity);
                    if (!employeeData) {
                        socket.emit('auth_error', { error: 'Authentication failed', message: 'Employee not found' });
                        return socket.disconnect();
                    }
                    if ((employeeData as any).isBlocked || (employeeData as any).isDeleted) {
                        socket.emit('auth_error', { error: 'Authentication failed', message: 'Account disabled' });
                        return socket.disconnect();
                    }
                    const userId = employeeData._id.toString();
                    // A socket serves one user at a time: leave the previous user's room on re-auth.
                    const previous = socket.data.userId;
                    if (previous && previous !== userId) {
                        socket.leave(previous);
                        if (connectedSockets[previous] === socket.id) delete connectedSockets[previous];
                    }
                    socket.data.userId = userId;
                    connectedSockets[userId] = socket.id;
                    socket.join(userId)
                } catch (error) {
                    console.log('Socket auth verification failed:', error.message);
                    socket.emit('auth_error', { error: 'Authentication failed', message: error.message });
                    socket.disconnect();
                }
            })

            socket.on('joinScanSession', (sessionId: string) => {
                if (typeof sessionId === 'string' && sessionId) {
                    socket.join(sessionId);
                }
            })

            socket.on('leaveScanSession', (sessionId: string) => {
                if (typeof sessionId === 'string' && sessionId) {
                    socket.leave(sessionId);
                }
            })

            socket.on('scanCode', async ({ sessionId, code }: { sessionId: string; code: string }) => {
                try {
                    if (!sessionId || !code) {
                        socket.emit('scanError', { sessionId, message: 'Invalid scan payload' });
                        return;
                    }

                    const session = await ScanSession.findOne({ sessionId });
                    if (!session) {
                        socket.emit('scanError', { sessionId, message: 'Scan session not found' });
                        return;
                    }

                    if (session.status !== 'active') {
                        socket.emit('scanError', { sessionId, message: 'Scan session is closed' });
                        return;
                    }

                    const scan = {
                        code,
                        order: session.scans.length + 1,
                        scannedAt: new Date(),
                    };

                    session.scans.push(scan as any);
                    await session.save();

                    socketIo.to(sessionId).emit('scanAdded', { sessionId, scan });
                } catch (error) {
                    console.log('scanCode error:', error.message);
                    socket.emit('scanError', { sessionId, message: 'Failed to record scan' });
                }
            })

        })

    } catch (error) {
        console.log(error)
    }
}

