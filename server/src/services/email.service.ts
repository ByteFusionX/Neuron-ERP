import { Client } from '@microsoft/microsoft-graph-client';
import axios from 'axios';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESSKEYID!,
    secretAccessKey: process.env.AWS_SECRETACCESSKEY!
  },
  endpoint: process.env.AWS_ENDPOINT
});

interface EmailAttachment {
  fileName: string;
  originalname: string;
  contentType?: string;
}

interface EmailOptions {
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  message: string;
  attachments?: EmailAttachment[];
}

export class EmailService {
  private graphClient: Client;

  constructor(accessToken: string) {
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  static async getGraphAccessToken(userToken: any): Promise<string> {
    try {
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      
      if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing required environment variables for Microsoft Graph');
      }

      const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      
      const requestBody = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        client_id: clientId,
        client_secret: clientSecret,
        assertion: userToken,
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read',
        requested_token_use: 'on_behalf_of'
      });

      const response = await axios.post(tokenEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data.access_token;
    } catch (error) {
      console.error('Error getting Graph access token:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Token exchange error details:', error.response.data);
        
        const errorData = error.response.data;
        if (errorData.error === 'invalid_grant' && errorData.error_description?.includes('AADSTS65001')) {
          throw new Error('CONSENT_REQUIRED: Admin consent is required for Mail.Send permission. Please contact your administrator to grant consent for the application.');
        }
        if (errorData.error === 'invalid_grant' && errorData.error_description?.includes('AADSTS70011')) {
          throw new Error('INVALID_SCOPE: The requested scope is not valid. Please check the Azure AD app registration permissions.');
        }
        if (errorData.error === 'unauthorized_client') {
          throw new Error('UNAUTHORIZED_CLIENT: The application is not authorized to perform on-behalf-of flow. Please check the app registration settings.');
        }
      }
      throw new Error('Failed to obtain access token for Microsoft Graph');
    }
  }

  async sendEmail(emailOptions: EmailOptions): Promise<void> {
    try {
      const { subject, from, to, cc = [], message, attachments = [] } = emailOptions;

      let emailAttachments: any[] = [];
      
      if (attachments && attachments.length > 0) {
        emailAttachments = await Promise.all(
          attachments.map(async (attachment) => {
            try {
              const fileContent = await this.getFileContentFromS3(attachment.fileName);
              const contentType = attachment.contentType || this.getContentType(attachment.originalname);
              
              return {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: attachment.originalname,
                contentBytes: fileContent,
                contentType: contentType
              };
            } catch (error) {
              console.error(`Error processing attachment ${attachment.fileName}:`, error);
              return null;
            }
          })
        );
        
        emailAttachments = emailAttachments.filter(attachment => attachment !== null);
      }

      const mailContent = {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: this.formatMessageForEmail(message)
          },
          toRecipients: to.map(email => ({
            emailAddress: {
              address: email
            }
          })),
          ccRecipients: cc.filter(email => email).map(email => ({
            emailAddress: {
              address: email
            }
          })),
          ...(emailAttachments.length > 0 && { attachments: emailAttachments })
        },
        categories: ['Neuron-ERP'],
        saveToSentItems: true
      };

      await this.graphClient.api('/me/sendMail').post(mailContent);
    } catch (error) {
      console.error('Error sending email via Graph API:', error);
      if (error instanceof Error && error.message.includes('Forbidden')) {
        throw new Error('PERMISSION_DENIED: Insufficient permissions to send email. Please ensure Mail.Send permission is granted and consented.');
      }
      throw new Error('Failed to send email via Microsoft Graph');
    }
  }

  private async getFileContentFromS3(fileName: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: fileName,
      });

      const response = await s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('No file body received from S3');
      }

      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      return buffer.toString('base64');
    } catch (error) {
      console.error('Error downloading file from S3:', error);
      throw new Error(`Failed to download file ${fileName} from S3`);
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.csv': 'text/csv'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  private formatMessageForEmail(message: string): string {
    if (!message) return '';
    return message
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/\r/g, '<br>');
  }
}

export const createEmailService = async (userToken: any): Promise<EmailService> => {
  try {
    const accessToken = await EmailService.getGraphAccessToken(userToken);
    return new EmailService(accessToken);
  } catch (error) {
    console.error('Error creating email service:', error);
    throw error;
  }
}; 