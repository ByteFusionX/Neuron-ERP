import { Server } from "socket.io";
import { verifyAndExtractOid } from "../common/utils/extractToken";
import { getEmployeeData } from "../common/utils/util";

export const connectedSockets = {};

export const socketConnection = async (socketIo:Server) => {
    try {
        let io = socketIo

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
                    const oid = await verifyAndExtractOid(token);
                    if (!oid) {
                        socket.emit('auth_error', { error: 'Authentication failed', message: 'Invalid token' });
                        return socket.disconnect();
                    }
                    const employeeData = await getEmployeeData({ oid });
                    if (!employeeData) {
                        socket.emit('auth_error', { error: 'Authentication failed', message: 'Employee not found' });
                        return socket.disconnect();
                    }
                    const userId = employeeData._id.toString();
                    connectedSockets[userId] = socket.id;
                    socket.join(userId)
                } catch (error) {
                    console.log('Socket auth verification failed:', error.message);
                    socket.emit('auth_error', { error: 'Authentication failed', message: error.message });
                    socket.disconnect();
                }
            })

        })

    } catch (error) {
        console.log(error)
    }
}

