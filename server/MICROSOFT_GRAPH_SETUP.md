# Microsoft Graph Email Setup Guide

## Prerequisites

To enable email sending functionality through Microsoft Graph, you need to configure your Azure AD application with the proper permissions and settings.

## Azure AD Application Configuration

### 1. Add Required Environment Variables

Add the following to your `.env` file:

```env
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
```

### 2. Azure AD App Registration Settings

#### API Permissions
Add the following permissions to your Azure AD app:

**Delegated Permissions:**
- `Mail.Send` - Send mail as a user
- `User.Read` - Sign in and read user profile

**Application Permissions (if using application-level access):**
- `Mail.Send` - Send mail as any user (requires admin consent)

#### Authentication
- Enable "Access tokens" and "ID tokens" in the Authentication section
- Add your redirect URIs
- **Important**: Enable "Allow public client flows" for on-behalf-of flow

#### Certificates & Secrets
- Create a new client secret and copy the value to `MICROSOFT_CLIENT_SECRET`

### 3. Admin Consent (CRITICAL STEP)

**This step is mandatory to resolve AADSTS65001 error:**

1. Go to Azure Portal > Azure Active Directory > App registrations > Your App
2. Go to API permissions
3. Click "Grant admin consent for [Your Organization]"
4. **Alternative method**: Use the admin consent URL:
   ```
   https://login.microsoftonline.com/{tenant-id}/adminconsent?client_id={client-id}
   ```
   Replace `{tenant-id}` and `{client-id}` with your actual values.

### 4. App Registration Manifest Settings

In your app registration manifest, ensure:
```json
{
  "acceptMappedClaims": true,
  "knownClientApplications": [],
  "oauth2AllowImplicitFlow": true,
  "oauth2AllowIdTokenImplicitFlow": true,
  "oauth2Permissions": [],
  "preAuthorizedApplications": []
}
```

## How It Works

The implementation uses the "on-behalf-of" OAuth flow:

1. User authenticates with Azure AD and receives a JWT token
2. When sending an email, the backend exchanges this token for a new access token with `Mail.Send` scope
3. The new token is used with Microsoft Graph API to send emails

## Usage

When creating or updating a project update with `status: 'Sent'`, the system will automatically:

1. Extract the JWT token from the Authorization header
2. Exchange it for a Microsoft Graph access token
3. Send the email using Microsoft Graph API
4. Return success/error response

## Troubleshooting

### AADSTS65001 Error (Most Common)

**Error**: `The user or administrator has not consented to use the application`

**Solution**:
1. Admin must grant consent for the application
2. Use the admin consent URL or Azure Portal method above
3. Ensure the user has proper permissions in your organization
4. Check that the application is not blocked by Conditional Access policies

### Other Common Issues

1. **Missing client secret**: Ensure `MICROSOFT_CLIENT_SECRET` is set in your environment
2. **AADSTS70011 - Invalid scope**: Check that permissions are added to app registration
3. **AADSTS50076 - MFA required**: User may need to complete multi-factor authentication
4. **Invalid token**: The user token must have the proper audience and scope

### Error Messages and Solutions

- **`CONSENT_REQUIRED`**: Admin consent is needed - follow step 3 above
- **`INVALID_SCOPE`**: Check app registration permissions
- **`UNAUTHORIZED_CLIENT`**: App not authorized for on-behalf-of flow
- **`PERMISSION_DENIED`**: Insufficient permissions to send email

### Testing Steps

1. **Verify app registration**:
   - Check that Mail.Send permission is added
   - Verify admin consent is granted (should show green checkmarks)

2. **Test token exchange**:
   ```bash
   curl -X POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token \
   -H "Content-Type: application/x-www-form-urlencoded" \
   -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&client_id={client-id}&client_secret={client-secret}&assertion={user-token}&scope=https://graph.microsoft.com/Mail.Send&requested_token_use=on_behalf_of"
   ```

3. **Test the API**:
   - Create a project update with status 'Sent'
   - Check the response for success/error messages
   - Verify the email was sent

## Consent URL Generator

Use this URL to grant admin consent (replace placeholders):
```
https://login.microsoftonline.com/{TENANT_ID}/adminconsent?client_id={CLIENT_ID}&redirect_uri=https://localhost:3000&scope=https://graph.microsoft.com/Mail.Send
```

## Security Considerations

- Client secrets should be stored securely and rotated regularly
- Use the principle of least privilege for API permissions
- Monitor email sending for abuse or unusual patterns
- Consider implementing rate limiting for email sending
- Ensure proper Conditional Access policies are in place 