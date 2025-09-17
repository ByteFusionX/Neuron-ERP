
import technicalModel from '../../models/technical.model';
import { createEmailService, EmailService } from '../../services/email.service';
import { emailQueue } from '../queues/email.queue';

class EmailWorker {
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;
  
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Email worker started');
    
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, 2000);
  }
  
  stop() {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log('Email worker stopped');
  }
  
  private async processJobs() {
    if (!this.isRunning) return;
    
    const job = emailQueue.getNextJob();
    if (!job) return;
    
    console.log(`Processing email job: ${job.id}`);
    
    try {
      const emailService = await createEmailService(job.jwtToken);
      await emailService.sendEmail({
        subject: job.subject,
        from: job.from,
        to: job.to,
        cc: job.cc,
        message: job.message,
        attachments: job.attachments
      });

      
      try {
        await technicalModel.updateOne(
          { "projectUpdates._id": job.projectId },
          { $set: { "projectUpdates.$.status": "Sent", "projectUpdates.$.updatedAt": new Date() } }
        );
      } catch (error) {
        console.error(`❌ Failed to update project update status: ${job.id}`, error);
      }

      console.log(`✅ Email sent successfully: ${job.id}`);
      
    } catch (error) {

      try {
        await technicalModel.updateOne(
          { "projectUpdates._id": job.projectId },
          { $set: { "projectUpdates.$.status": "Failed", "projectUpdates.$.updatedAt": new Date() } }
        );
      } catch (error) {
        console.error(`❌ Failed to update project update status: ${job.id}`, error);
      }
      
      emailQueue.requeueJob(job);
    }
  }
}

export const emailWorker = new EmailWorker();