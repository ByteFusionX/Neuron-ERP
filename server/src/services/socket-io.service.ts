import { Server } from "socket.io";
import jwt from 'jsonwebtoken'
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
                const microsoftPayload = jwt.decode(token)
                const employeeData = await getEmployeeData(microsoftPayload)
                const userId = employeeData._id;
                connectedSockets[userId] = socket.id;
                socket.join(userId)
            })

        })

    } catch (error) {
        console.log(error)
    }
}

