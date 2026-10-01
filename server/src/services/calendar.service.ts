import { Client } from '@microsoft/microsoft-graph-client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface CalendarEventOptions {
  subject: string;
  start: Date;
  end: Date;
  body?: string;
  location?: string;
  attendees?: string[];
  onlineMeeting?: boolean;
  timeZone?: string;
}

const DEFAULT_TIME_ZONE = 'UTC';

export class CalendarService {
  private graphClient: Client;
  // '/me' for delegated tokens, '/users/{upn}' for app-only tokens.
  private userPath: string;

  constructor(accessToken: string, userPath = '/me') {
    this.userPath = userPath;
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  // On-behalf-of exchange for Calendars.ReadWrite. `userToken` must be an Azure AD
  // access token whose audience is this API (api://<client-id>/access_as_user).
  static async getGraphAccessToken(userToken: string): Promise<string> {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables for Microsoft Graph');
    }

    try {
      const requestBody = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        client_id: clientId,
        client_secret: clientSecret,
        assertion: userToken,
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite',
        requested_token_use: 'on_behalf_of'
      });

      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        requestBody,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      return response.data.access_token;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Calendar token exchange error details:', error.response.data);
      }
      throw new Error('Failed to obtain Graph access token for calendar');
    }
  }

  // Client-credentials token (Application Calendars.ReadWrite) for pushes made without a signed-in user.
  static async getAppOnlyToken(): Promise<string> {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables for Microsoft Graph');
    }

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data.access_token;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Calendar app-only token error details:', error.response.data);
      }
      throw new Error('Failed to obtain app-only Graph access token for calendar');
    }
  }

  // Returns the Graph event id so the ERP record can PATCH/DELETE it later.
  async createEvent(options: CalendarEventOptions): Promise<string> {
    const response = await this.graphClient.api(`${this.userPath}/events`).post(this.buildPayload(options));
    return response.id;
  }

  async updateEvent(outlookEventId: string, options: CalendarEventOptions): Promise<void> {
    await this.graphClient.api(`${this.userPath}/events/${outlookEventId}`).patch(this.buildPayload(options));
  }

  async deleteEvent(outlookEventId: string): Promise<void> {
    await this.graphClient.api(`${this.userPath}/events/${outlookEventId}`).delete();
  }

  private buildPayload(options: CalendarEventOptions) {
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    const { subject, start, end, body, location, attendees = [], onlineMeeting } = options;

    return {
      subject,
      body: { contentType: 'HTML', content: body || '' },
      start: { dateTime: start.toISOString().replace('Z', ''), timeZone },
      end: { dateTime: end.toISOString().replace('Z', ''), timeZone },
      ...(location && { location: { displayName: location } }),
      attendees: attendees.filter(email => email).map(email => ({
        emailAddress: { address: email },
        type: 'required'
      })),
      categories: ['Neuron-ERP'],
      ...(onlineMeeting && { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' })
    };
  }
}

export const createCalendarService = async (userToken: string): Promise<CalendarService> => {
  const accessToken = await CalendarService.getGraphAccessToken(userToken);
  return new CalendarService(accessToken);
};

// App-only fallback, opt-in via MICROSOFT_CALENDAR_APP_ONLY=true. Needs the Application
// permission Calendars.ReadWrite (admin consent); scope it with an Exchange Application
// Access Policy, since it otherwise reaches every mailbox in the tenant.
export const isAppOnlyCalendarEnabled = (): boolean => process.env.MICROSOFT_CALENDAR_APP_ONLY === 'true';

export const createAppOnlyCalendarService = async (userEmail: string): Promise<CalendarService> => {
  const accessToken = await CalendarService.getAppOnlyToken();
  return new CalendarService(accessToken, `/users/${encodeURIComponent(userEmail)}`);
};
