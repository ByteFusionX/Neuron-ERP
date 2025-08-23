interface EmailJob {
  id: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  message: string;
  attachments: any[];
  jwtToken: string;
  priority: 'high' | 'normal' | 'low';
  createdAt: Date;
  attempts: number;
  projectId: string;
}

class EmailQueue {
  private jobs: EmailJob[] = [];
  
  addJob(emailData: Omit<EmailJob, 'id' | 'createdAt' | 'attempts'>) {
    const job: EmailJob = {
      ...emailData,
      id: `email_${Date.now()}_${Math.random()}`,
      createdAt: new Date(),
      attempts: 0
    };
    
    if (emailData.priority === 'high') {
      this.jobs.unshift(job);
    } else {
      this.jobs.push(job);
    }
    
    console.log(`Email job queued: ${job.id}`);
  }
  
  getNextJob(): EmailJob | null {
    return this.jobs.shift() || null;
  }
  
  requeueJob(job: EmailJob) {
    job.attempts++;
    if (job.attempts < 3) {
      this.jobs.push(job);
    } else {
      console.error(`Email job failed permanently: ${job.id}`);
    }
  }
  
  getQueueSize(): number {
    return this.jobs.length;
  }
}

export const emailQueue = new EmailQueue();
