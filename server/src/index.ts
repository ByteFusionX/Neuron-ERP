import express from 'express';
import cors from 'cors';
import fs from 'fs';
import dotenv from "dotenv";
import morgan from "morgan";
import * as path from 'path';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import router from './routes/user.router';
import depRouter from './routes/department.router';
import empRouter from './routes/employee.router';
import annoRouter from './routes/announcment.router';
import cusRouter from './routes/customer.router';
import equiRouter from './routes/enquiry.router';
import celebRouter from './routes/celebrationCheck.router';
import startCronJob from './services/cron.service';
import quoteRouter from './routes/quotation.router';
import fileRouter from './routes/file.router';
import PassportMiddleware from './common/middlewares/jwt.middleware';
import jobRouter from './routes/job.router';
import catRouter from './routes/category.router';
import { socketConnection } from './services/socket-io.service';
import noteRouter from './routes/note.router';
import companyRouter from './routes/company.router';
import dashboardRouter from './routes/dashboard.router';
import trashRouter from './routes/trash.router';
import eventRouter from './routes/event.router';
import { connectToDatabase } from './db/connect';
import notificationRouter from './routes/notification.router';
import customerTypeRouter from './routes/customerType.router';
import supplierRouter from './routes/supplier.router';
import purchaseRequestRouter from './routes/purchaseRequest.router';
import technicalRouter from './routes/technical.router';
import workflowRouter from './routes/workflow.router';
import { bearerStrategyOptions } from './common/utils/tokenValidator';
import passport from 'passport';
import { BearerStrategy } from 'passport-azure-ad';
import Employee from './models/employee.model'
import { emailWorker } from './common/workers/email.worker';
import { emailQueue } from './common/queues/email.queue';
import claimRouter from './routes/claim.router';

const app = express();
const server = http.createServer(app);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
export const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN1 ?? 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  }
});
global.io = io;
app.set('io', io);

app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());


app.use(cors({
  origin: process.env.ORIGIN1 ?? 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

const bearerStrategy = new BearerStrategy(bearerStrategyOptions, (token, done) => {
  try {
    return done(null, token, token);
  } catch (error) {
    return done(error, null);
  }
});


app.use(passport.initialize());
passport.use(bearerStrategy);

app.use(PassportMiddleware);

app.use('/', router);
app.use('/department', depRouter);
app.use('/employee', empRouter);
app.use('/announcement', annoRouter);
app.use('/customer', cusRouter);
app.use('/enquiry', equiRouter);
app.use('/celebrationCheck', celebRouter);
app.use('/quotation', quoteRouter);
app.use('/category', catRouter);
app.use('/file', fileRouter);
app.use('/job', jobRouter);
app.use('/note', noteRouter);
app.use('/company', companyRouter)
app.use('/dashboard', dashboardRouter)
app.use('/trash', trashRouter)
app.use('/events', eventRouter)
app.use('/notification', notificationRouter)
app.use('/customerType', customerTypeRouter)
app.use('/supplier', supplierRouter)
app.use('/purchase', purchaseRequestRouter)
app.use('/technical', technicalRouter)
app.use('/workflow', workflowRouter)
app.use('/claim', claimRouter)


const uploadFolderPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadFolderPath));

if (!fs.existsSync(uploadFolderPath)) {
  fs.mkdirSync(uploadFolderPath);
}

connectToDatabase()
  .then(() => {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });


    startCronJob();
    socketConnection(io)

    emailWorker.start();
  })
  .catch((err) => {
    console.error('Failed to connect to the database:', err);
    process.exit(1); // Exit the process if the database connection fails
  });


process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  emailWorker.stop();

  while (emailQueue.getQueueSize() > 0) {
    console.log(`Waiting for ${emailQueue.getQueueSize()} emails to finish...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  process.exit(0);
});
