import employeeModel from "../models/employee.model";
import announcementModel from "../models/announcement.model";
import Notification from "../models/notification.model";
import { fetchExchangeRate } from "../common/utils/util";
import Event from '../models/events.model';
import Quotation from '../models/quotation.model';
import { createNotification } from '../controllers/notification.controller';
import { Server } from "socket.io";
const cron = require('node-cron');

const processEmployeeEvent = async (element, eventType) => {
    try {
        let eventTitle = '';
        let eventDescription = '';

        if (eventType === 'birthday') {
            eventTitle = `Happy Birthday ${element.firstName} ${element.lastName}`;
            eventDescription = 'Sending warm birthday wishes to our valued employees! May your special day be filled with joy, prosperity, and unforgettable moments. Your dedication contributes to the success of our company, and we appreciate your continued commitment. Happy Birthday!';
        } else if (eventType === 'anniversary') {

            const joinedDate = new Date(element.dateOfJoining);
            const today = new Date();
            const workAnniversary = new Date(today.getTime() - joinedDate.getTime());
            const yearsOfExperience = Math.abs(workAnniversary.getUTCFullYear() - 1970);

            eventTitle =`Congrats ${element.firstName} ${element.lastName} on ${yearsOfExperience} years! Happy Work Anniversary!`;
            eventDescription = 'Sending warm anniversary wishes to our valued employees! Thank you for your dedication and contributions to our success. Here\'s to many more years of collaboration and achievements. Happy Work Anniversary!';
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const alreadyAnnounced = await announcementModel.findOne({
            title: eventTitle,
            date: today,
            celeb: true
        });
        if (alreadyAnnounced) return true;

        const saveEvent = new announcementModel({
            title: eventTitle,
            description: eventDescription,
            date: today,
            celeb: true,
            viewedBy: [],
            createdDate: new Date(),
            category:['all']
        });


        const saveComment = await saveEvent.save();

        if (!saveComment) return false;
        return true;
    } catch (error) {
        console.error(`Error saving ${eventType} announcement:`, error.message);
        return false;
    }
};

const startCronJob = () => {
    cron.schedule('0 1 * * *', async () => {
        try {
            console.log('Working cron scheduled');
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();

            const [birthdayEmployees, anniversaryEmployees] = await Promise.all([
                employeeModel.find({
                    isBlocked: { $ne: true },
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$dob" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$dob" }, currentDay] }
                        ]
                    }
                }),
                employeeModel.find({
                    isBlocked: { $ne: true },
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$dateOfJoining" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$dateOfJoining" }, currentDay] }
                        ]
                    }
                })
            ]);

            if (birthdayEmployees.length > 0) {
                const birthdayPromises = birthdayEmployees.map(element => processEmployeeEvent(element, 'birthday'));
                await Promise.all(birthdayPromises);
            }

            if (anniversaryEmployees.length > 0) {
                const anniversaryPromises = anniversaryEmployees.map(element => processEmployeeEvent(element, 'anniversary'));
                await Promise.all(anniversaryPromises);
            }
            checkTodayEventsAndSendNotifications()

            await Quotation.updateMany(
                {
                    closingDate: { $lt: today },
                    status: { $nin: ['Won', 'Lost', 'Expired'] },
                    isDeleted: { $ne: true }
                },
                { $set: { status: 'Expired' } }
            );

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
            const notifications = await Notification.find({
                date: { $lt: thirtyDaysAgo },
                'recipients.status': 'read'
            });
    
            await Promise.all(
                notifications.map(async (notification) => {
                    const allRead = notification.recipients.every(recipient => recipient.status === 'read');
                    if (allRead) {
                        await Notification.deleteOne({ _id: notification._id });
                        return;
                    }

                    await Notification.updateOne(
                        { _id: notification._id },
                        { $pull: { recipients: { status: 'read' } } }
                    );
                })
            );

        } catch (error) {
            console.error('Cron job error:', error.message);
        }
    }).start();
    fetchExchangeRate();


    cron.schedule('0 */4 * * *', () => {
        console.log('Updating exchange rate...');
        fetchExchangeRate();
    }).start();
};

const checkTodayEventsAndSendNotifications = async () => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const events = await Event.find({ date: { $gte: startOfDay, $lt: endOfDay } });

        events.forEach(async (event) => {
            // Create and send notifications for each event
            const saveNewNotification = await createNotification({
                type: 'Event',
                referenceModel: 'Event',
                title: `You have ${event.event} Assigned Today!`,
                message: `${event.summary}`,
                date: new Date(),
                sentBy: event.createdBy,
                recipients: [{ objectId: event.employee, status: 'unread' }],
                referenceId: event._id,
                additionalData: {}
            });

            if (saveNewNotification) {
                const socket = global.io as Server; // Assuming you have access to the global io instance
                saveNewNotification.recipients.forEach((recipient) => {
                    socket.to(recipient.objectId._id.toString()).emit("recieveNotifications", saveNewNotification);
                });
            }
        });
    } catch (error) {
        console.error("Error checking today's events and sending notifications:", error);
    }
}

export { checkTodayEventsAndSendNotifications };
export default startCronJob
