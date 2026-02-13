# Notification System Test Scenarios

This document outlines all test scenarios for the new privilege-aware notification system.

## Test Setup Requirements

1. **User Roles**: Create test users with different privilege levels:
   - Super Admin (all privileges)
   - Admin (limited privileges)
   - Regular User (restricted privileges)
   - User with no access to specific modules

2. **Test Data**: Ensure test data exists for:
   - Enquiries
   - Quotations
   - Announcements
   - Employees with different categories

## Notification Types to Test

### 1. Announcement Notifications

#### Scenario 1.1: Create Announcement for All Categories
- **Action**: Create an announcement with category set to "all"
- **Expected**: 
  - All employees (except creator) with `announcement.viewReport !== 'none'` receive notification
  - Notification type: `Announcement`
  - Route: `/home/announcements`
  - Creator does not receive notification

#### Scenario 1.2: Create Announcement for Specific Category
- **Action**: Create an announcement for a specific category
- **Expected**:
  - Only employees in that category with `announcement.viewReport !== 'none'` receive notification
  - Employees in other categories do not receive notification

#### Scenario 1.3: Edit Announcement
- **Action**: Edit an existing announcement
- **Expected**: Same notification behavior as creating new announcement

#### Scenario 1.4: Privilege Filtering - No Access
- **Action**: Create announcement, user has `announcement.viewReport === 'none'`
- **Expected**: User does not receive notification

### 2. AssignedJob Notifications

#### Scenario 2.1: Assign Presale Job
- **Action**: Assign a presale person to an enquiry
- **Expected**:
  - Assigned presale person receives notification
  - Notification type: `AssignedJob`
  - Route: `/enquiry` with enquiryId in routeData
  - Only if user has `assignedJob.viewReport !== 'none'`
  - Notification includes enquiryId in additionalData

#### Scenario 2.2: Give Feedback on Assigned Job
- **Action**: Provide feedback on an assigned job
- **Expected**:
  - Presale person receives notification
  - Notification type: `AssignedJob`
  - Title: "Feedback Received"
  - Route: `/enquiry` with enquiryId

#### Scenario 2.3: Request Revision
- **Action**: Request revision on presale job (giveRevision)
- **Expected**:
  - Presale person receives notification
  - Notification type: `AssignedJob`
  - Title: "Revision Requested"
  - Route: `/enquiry` with enquiryId

#### Scenario 2.4: Revise Quote Estimation
- **Action**: Revise quote estimation (reviseQuoteEstimation)
- **Expected**:
  - Presale person receives notification
  - Notification type: `AssignedJob`
  - Title: "Quote Estimation Revised"
  - Route: `/enquiry` with enquiryId

#### Scenario 2.5: Reject Presale Job
- **Action**: Reject a presale job (RejectPresaleJob)
- **Expected**:
  - Presale person receives notification
  - Notification type: `AssignedJob`
  - Title: "Presale Job Rejected"
  - Route: `/enquiry` with enquiryId

#### Scenario 2.6: Privilege Filtering - No Access to Assigned Jobs
- **Action**: Assign job to user with `assignedJob.viewReport === 'none'`
- **Expected**: User does not receive notification

### 3. ReAssignedJob Notifications

#### Scenario 3.1: Reassign Job
- **Action**: Reassign a job to a different employee (reAssignJob)
- **Expected**:
  - Newly assigned employee receives notification
  - Notification type: `ReAssignedJob`
  - Title: "Job Reassigned to You"
  - Route: `/enquiry` with enquiryId
  - Only if user has `assignedJob.viewReport !== 'none'`

### 4. FeedbackRequest Notifications

#### Scenario 4.1: Request Feedback
- **Action**: Request feedback from an employee (requestFeedback)
- **Expected**:
  - Requested employee receives notification
  - Notification type: `FeedbackRequest`
  - Title: "Feedback Requested"
  - Route: `/enquiry` with enquiryId
  - Only if user has `assignedJob.viewReport !== 'none'`

### 5. Enquiry Notifications

#### Scenario 5.1: Update Enquiry Status
- **Action**: Update enquiry status (updateEnquiryStatus)
- **Expected**:
  - Sales person receives notification
  - Notification type: `Enquiry`
  - Title: "Enquiry Status Updated"
  - Route: `/enquiry` with enquiryId
  - Only if user has `enquiry.viewReport !== 'none'`
  - Only triggers if no quotation exists for the enquiry

### 6. Quotation Notifications

#### Scenario 6.1: Deal Sheet Approved
- **Action**: Approve a deal sheet (approveDeal)
- **Expected**:
  - Quotation creator receives notification
  - Notification type: `Quotation`
  - Title: "Deal Sheet Approved"
  - Route: `/quotations/view` with full quotation object in routeData
  - Only if user has `quotation.viewReport !== 'none'`

#### Scenario 6.2: Deal Sheet Rejected
- **Action**: Reject a deal sheet (rejectDeal)
- **Expected**:
  - Quotation creator receives notification
  - Notification type: `Quotation`
  - Title: "Deal Sheet Rejected"
  - Route: `/quotations/view` with full quotation object in routeData
  - Only if user has `quotation.viewReport !== 'none'`

### 7. DealSheet Notifications

#### Scenario 7.1: Save Deal Sheet
- **Action**: Save/submit a deal sheet (saveDealSheet)
- **Expected**:
  - All users with `dealSheet === true` privilege receive notification
  - Notification type: `DealSheet`
  - Title: "New Deal Sheet Pending Approval"
  - Route: `/quotations/view` with full quotation object in routeData
  - Includes quotationId in additionalData

#### Scenario 7.2: Revoke Deal Sheet
- **Action**: Revoke a deal sheet (revokeDeal)
- **Expected**:
  - All users with `dealSheet === true` privilege receive notification
  - Notification type: `DealSheet`
  - Title: "Deal Sheet Revoked"
  - Route: `/quotations/view` with full quotation object in routeData

#### Scenario 7.3: Privilege Filtering - No Deal Sheet Access
- **Action**: Save deal sheet, user has `dealSheet === false`
- **Expected**: User does not receive notification

### 8. Event Notifications (Existing)

#### Scenario 8.1: Create Event
- **Action**: Create an event with assigned employee
- **Expected**:
  - Assigned employee receives notification
  - Notification type: `Event`
  - Route based on event's `from` field (Enquiry or Quotation)
  - Existing behavior should continue to work

## Frontend Testing Scenarios

### 9. Notification Display

#### Scenario 9.1: View Unread Notifications
- **Action**: Open notification drawer
- **Expected**:
  - All unread notifications displayed
  - Notifications filtered by user privileges
  - Each notification shows:
    - Title
    - Message
    - Sender information
    - Item ID (enquiryId, quotationId, etc.)
    - Date/time

#### Scenario 9.2: View Read Notifications
- **Action**: Switch to "Read" tab in notification drawer
- **Expected**:
  - All read notifications displayed
  - Same privilege filtering applied

#### Scenario 9.3: Privilege Filtering on Fetch
- **Action**: User with restricted privileges fetches notifications
- **Expected**:
  - Only notifications for modules user has access to are returned
  - Notifications for restricted modules are filtered out

### 10. Notification Interaction

#### Scenario 10.1: Click Quotation Notification
- **Action**: Click on a Quotation notification
- **Expected**:
  - Notification marked as read
  - Navigate to `/quotations/view` with quotation data in router state
  - Quotation view component displays the correct quotation

#### Scenario 10.2: Click Enquiry/AssignedJob Notification
- **Action**: Click on an Enquiry or AssignedJob notification
- **Expected**:
  - Notification marked as read
  - Navigate to `/enquiry` with enquiryId in query params
  - Enquiry component loads/displays the specific enquiry

#### Scenario 10.3: Click Announcement Notification
- **Action**: Click on an Announcement notification
- **Expected**:
  - Notification marked as read
  - Navigate to `/home/announcements`
  - Announcements list is displayed

#### Scenario 10.4: Click Deal Sheet Notification
- **Action**: Click on a DealSheet notification
- **Expected**:
  - Notification marked as read
  - Navigate to `/quotations/view` with quotation data
  - Quotation view displays deal sheet information

#### Scenario 10.5: Mark as Read Manually
- **Action**: Click "Mark as Read" button without navigating
- **Expected**:
  - Notification moved from unread to read
  - Notification count updated
  - Notification remains in drawer under "Read" tab

### 11. Real-time Updates

#### Scenario 11.1: Socket.io Real-time Notification
- **Action**: Another user creates a notification for current user
- **Expected**:
  - Notification appears immediately in unread list
  - Notification count badge updates
  - No page refresh required

#### Scenario 11.2: Multiple Notifications
- **Action**: Receive multiple notifications simultaneously
- **Expected**:
  - All notifications appear in unread list
  - Notifications ordered by date (newest first)
  - Each notification is clickable and routes correctly

### 12. Edge Cases

#### Scenario 12.1: User Without Privileges
- **Action**: User with no privileges tries to view notifications
- **Expected**:
  - Empty notification list returned
  - No errors thrown
  - UI handles empty state gracefully

#### Scenario 12.2: Notification for Deleted Item
- **Action**: Click notification for enquiry/quotation that was deleted
- **Expected**:
  - Navigation still works
  - Target component handles missing data gracefully
  - Error message or redirect if item not found

#### Scenario 12.3: Multiple Users, Same Action
- **Action**: Create announcement that should notify multiple users
- **Expected**:
  - All eligible users receive notification
  - Each user sees only their own notification status
  - Privilege filtering works for each user independently

#### Scenario 12.4: Notification with Missing Route Data
- **Action**: Notification exists but routeData is missing
- **Expected**:
  - Navigation defaults to `/home`
  - No errors thrown
  - User can still mark notification as read

#### Scenario 12.5: Notification Creator
- **Action**: User creates notification that would normally notify themselves
- **Expected**:
  - Creator does not receive notification
  - Other eligible users still receive notification

## Integration Testing

### 13. End-to-End Flows

#### Scenario 13.1: Complete Job Assignment Flow
1. Sales person creates enquiry
2. Presale manager assigns job to presale engineer
3. Presale engineer receives notification
4. Presale engineer clicks notification
5. Enquiry page opens with correct enquiry
6. Presale engineer provides feedback
7. Presale manager receives notification about feedback

#### Scenario 13.2: Deal Sheet Approval Flow
1. Sales person creates quotation
2. Sales person submits deal sheet
3. Approvers receive notification
4. Approver clicks notification
5. Quotation view opens
6. Approver approves deal
7. Sales person receives approval notification

#### Scenario 13.3: Announcement Flow
1. Admin creates announcement for specific category
2. Users in that category receive notification
3. User clicks notification
4. Announcements page opens
5. User marks announcement as viewed
6. Notification moves to read

## Performance Testing

### 14. Load Testing

#### Scenario 14.1: Bulk Notification Creation
- **Action**: Create announcement for all users (100+)
- **Expected**:
  - All notifications created successfully
  - No performance degradation
  - Socket.io handles all emits efficiently

#### Scenario 14.2: Large Notification List
- **Action**: User with 100+ notifications fetches list
- **Expected**:
  - Notifications load in reasonable time
  - Privilege filtering works efficiently
  - UI remains responsive

## Security Testing

### 15. Privilege Validation

#### Scenario 15.1: Privilege Bypass Attempt
- **Action**: User tries to access notification they shouldn't see
- **Expected**:
  - Notification filtered out on fetch
  - User cannot access notification data
  - Backend validates privileges

#### Scenario 15.2: Cross-User Notification Access
- **Action**: User tries to mark another user's notification as read
- **Expected**:
  - Only user's own notifications can be marked as read
  - Backend validates recipient ID

## Test Checklist

- [ ] All notification types create notifications correctly
- [ ] Privilege filtering works on creation
- [ ] Privilege filtering works on fetch
- [ ] Socket.io real-time updates work
- [ ] Navigation routes to correct pages
- [ ] Navigation includes correct data (router state/query params)
- [ ] Mark as read functionality works
- [ ] Notification counts update correctly
- [ ] Empty states handled gracefully
- [ ] Error cases handled gracefully
- [ ] Performance is acceptable with large datasets
- [ ] Security validations work correctly

## Notes

- Test with different user roles and privilege combinations
- Verify notifications appear in correct order (newest first)
- Check that notification badges update correctly in navbar
- Ensure notification drawer opens/closes properly
- Verify that clicking notifications closes the drawer (if implemented)
- Test on different screen sizes (mobile/desktop)
