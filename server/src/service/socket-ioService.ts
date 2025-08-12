import { Server } from "socket.io";
import jwt from 'jsonwebtoken'

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

            socket.on('auth',(token)=> {
                try {
                    const jwtPayload = jwt.verify(token,process.env.JWT_SECRET)
                    const userId = (<any>jwtPayload).id;
                    connectedSockets[userId] = socket.id;
                    socket.join(userId)
                } catch (error) {
                    console.log('Socket JWT verification failed:', error.message);
                    socket.emit('auth_error', { 
                        error: 'Authentication failed', 
                        message: error.message 
                    });
                    socket.disconnect();
                }
            })

        })

    } catch (error) {
        console.log(error)
    }
}

