# Neuron ERP — end-to-end manual test checklist

Use this file while testing the running app (client + server + database). Tick items with `[x]` as you complete them.

**Referencing fixes in chat:** cite the ID in bold, e.g. “Please fix **#142**” or “**#088** and **#089** fail on staging.” IDs are unique across the whole document.

**Suggested accounts:** keep at least three browser profiles or incognito windows—e.g. super admin, a role with broad privileges, and a role with minimal privileges—to exercise **#101** onward efficiently.

---

## Environment and smoke

- [ ] **#001** App loads in the browser with no console errors on first paint (ignore known dev warnings only if documented).
- [ ] **#002** API base URL in the client matches the server you are hitting (`environment` / proxy).
- [ ] **#003** Socket.IO (or realtime) connects after login; no permanent disconnect loop in the network tab.
- [ ] **#004** Page refresh while logged in restores session correctly (token / employee data).
- [ ] **#005** Direct URL paste (e.g. `/purchase/pendings`) loads or redirects consistently with guards.
- [ ] **#006** Browser back/forward does not leave the UI in a broken shell (blank outlet, duplicate sidebars).
- [ ] **#007** Mobile or narrow viewport: primary navigation and tables remain usable or degrade gracefully.

---

## Authentication and session

- [ ] **#008** Login with valid credentials succeeds and lands on the expected home/dashboard route.
- [ ] **#009** Login with invalid credentials shows a clear error and does not leave a partial session.
- [ ] **#010** Logout clears tokens/local state and blocks protected routes.
- [ ] **#011** Accessing `/login` while already authenticated respects `LoginGuard` (redirect away or stay as designed).
- [ ] **#012** Expired or revoked token: next API call surfaces error and user is sent to login or shown recovery UX.
- [ ] **#013** Blocked employee (`isBlocked`): guard shows the blocked message, clears token, redirects to login (align with `RoleGuard` + API).

---

## Notifications (panel, realtime, persistence)

- [ ] **#014** Notification panel opens from the shell (sidebar/header) without layout breakage.
- [ ] **#015** Unread vs read tabs switch correctly; counts match what you see in the list.
- [ ] **#016** Initial load: `GET` notifications populate the panel (historical viewed/unviewed).
- [ ] **#017** Realtime: triggering an action in another session adds an item to unviewed without full page reload.
- [ ] **#018** Mark single notification as read: it moves to read, persists after refresh.
- [ ] **#019** Mark-all / bulk read (if present) behaves correctly and syncs with server.
- [ ] **#020** Notification icons by type (Call, Meeting, Email, Other, default) render as intended.
- [ ] **#021** Closing the notification drawer emits close behavior correctly (no stuck overlay).
- [ ] **#022** Empty unread state is understandable (no broken spinner forever).

### Notification deep links (click-through)

- [ ] **#023** Type **Announcement** → `/home/announcements` opens correctly.
- [ ] **#024** **AssignedJob** → `/assigned-jobs`.
- [ ] **#025** **ReAssignedJob** → `/assigned-jobs/reassigned`.
- [ ] **#026** **Enquiry** / **FeedbackRequest** → `/enquiry` with correct `enquiryId` query when provided.
- [ ] **#027** **DealSheet** → `/deal-sheet/pendings`.
- [ ] **#028** **DealSheetResponse** → `/quotations`.
- [ ] **#029** **Quotation** → `/quotations/view` with correct `state` / quotation reference.
- [ ] **#030** **JobAllocated** → `/purchase/create` with `jobId` query when provided.
- [ ] **#031** **MrRequest** / **MrRejected** → material request route with `technicalId` segment when provided.
- [ ] **#032** **MrApprovalRequest** → `/technical/mr-approval-requests/view/:id` with correct id.
- [ ] **#033** **MrApproved** → `/purchase/create` with `jobId` when provided.
- [ ] **#034** **TechnicalAssigned** → `/technical/project/edit/:projectId`.
- [ ] **#035** **PurchaseApprovalRequest** / **PurchaseRejected** → `/purchase/view-purchase/:id`.
- [ ] **#036** **PurchaseApproved** → `/purchase/initiate-lpo/:id`.
- [ ] **#037** **LpoApprovalRequest** → `/purchase-order/pending-approval`.
- [ ] **#038** **LpoApproved** / **LpoRejected** → `/purchase/initiate-lpo/:purchaseId` when data present.
- [ ] **#039** **SupplierApprovalRequest** / **SupplierApproved** / **SupplierRejected** → supplier route with id when present.
- [ ] **#040** **ClaimApprovalRequest** → `/claims/approval-requests`.
- [ ] **#041** **ClaimApproved** / **ClaimRejected** → claims or technical claims route with `technicalId` when present.
- [ ] **#042** **Event** from Enquiry → enquiry with `collectionId` as enquiry id.
- [ ] **#043** **Event** from Quotation → quotation view with correct reference.
- [ ] **#044** Unknown / legacy notification type falls back without crashing (e.g. home or safe route).

### Notifications vs access control

- [ ] **#045** After clicking a notification, if the user lacks privilege for the destination, behavior is acceptable (redirect, message—not a blank error page).
- [ ] **#046** Deep link plus `RoleGuard`: verify whether mismatch between menu visibility and guard is intentional; document any gap.

---

## Access privileges and routing (`AuthGuard`, `RoleGuard`, super admin)

- [ ] **#047** Unauthenticated user cannot open any `canActivate: [AuthGuard]` route (redirect to login).
- [ ] **#048** `/home/employees` denied when `employee.viewReport === 'none'`.
- [ ] **#049** `/home/announcements` denied when `announcement.viewReport === 'none'`.
- [ ] **#050** `/customers` denied when `customer.viewReport === 'none'`.
- [ ] **#051** `/customers/create` denied when `customer.create` is false.
- [ ] **#052** `/enquiry` denied when `enquiry.viewReport === 'none'`.
- [ ] **#053** `/assigned-jobs` denied when `assignedJob.viewReport` is `none` or `assigned` (per guard logic).
- [ ] **#054** `/assigned-jobs/reassigned` and `/assigned-jobs/completed` denied when `assignedJob.viewReport === 'none'`.
- [ ] **#055** `/quotations` denied when `quotation.viewReport === 'none'`.
- [ ] **#056** `/quotations/create` denied when `quotation.create` is false **except** navigation from `/enquiry` when guard allows that exception.
- [ ] **#057** `/job-sheet` denied when `jobSheet.viewReport === 'none'`.
- [ ] **#058** `/deal-sheet` denied when `dealSheet` privilege is false.
- [ ] **#059** `/settings` denied when no `portalManagement.*` flag is true.
- [ ] **#060** `/recycle` denied for non–super-admin.
- [ ] **#061** `/purchase/*` denied when `purchase.viewReport === 'none'`.
- [ ] **#062** `/purchase-order/*` denied when `purchaseOrder.viewReport` is missing or `none`.
- [ ] **#063** `/technical/*` denied when user has none of: `technical.viewReport` not `none`, `canViewOpenToWorkAndAssign`, `canTransferToEngineer`, `canApproveMRRequests` (per guard).
- [ ] **#064** `/suppliers/*` denied when `supplier.viewReport === 'none'`.
- [ ] **#065** `/inventory/*` denied when both `inventory.products.viewReport` and `inventory.stockEntries.viewReport` are `none`.
- [ ] **#066** `/claims/my-claims` denied when `claims.viewReport` is `none` or undefined.
- [ ] **#067** `/claims/approval-requests` denied when `claims.canApprove` is false.
- [ ] **#068** Dispatch: create/edit DN denied without `dispatch.createDeliveryNote` (redirect to register per guard).
- [ ] **#069** `/dispatch/pending-delivery-reports` denied without `dispatch.viewPendingDelivery`.
- [ ] **#070** `/dispatch/invoice-linking-report` denied without `dispatch.viewInvoiceLinking`.
- [ ] **#071** `/dispatch/inventory-deduction-report` denied without `dispatch.viewInventoryDeduction`.
- [ ] **#072** General dispatch register denied without `dispatch.viewReport` (when not matched by sub-rules).
- [ ] **#073** Invoice create/edit/reissue denied without `invoice.createInvoice` (redirect to register per guard).
- [ ] **#074** `/invoice/invoice-dn-linking` denied without `invoice.viewInvoicesVsDn`.
- [ ] **#075** `/invoice/cancelled-invoices` denied without `invoice.viewCancelledAdjusted`.
- [ ] **#076** `/invoice/reissued` denied without `invoice.viewReissued`.
- [ ] **#077** General invoice register denied without `invoice.viewReport` (when not matched by sub-rules).
- [ ] **#078** Super-admin category bypasses intended restrictions where applicable (document expected behavior).

---

## Sidebar and UI visibility

- [ ] **#079** Each sidebar entry hidden when privilege matches “none” (or equivalent) matches **#047–#077** outcomes.
- [ ] **#080** Jobs submenu: “Assigned Jobs” vs “Reassigned” alternate label when `assignedJob.viewReport !== 'all'` behaves correctly.
- [ ] **#081** Notification badges on menu items (e.g. enquiry, quotations) update after reads and realtime events.
- [ ] **#082** Active route highlighting stays correct after nested navigation.
- [ ] **#083** No link appears that always 403s or redirects home for that user (privilege drift).

---

## Cross-cutting validation, errors, and tables

- [ ] **#084** Required fields: empty submit shows field-level or toast errors consistently across major forms.
- [ ] **#085** Invalid formats (email, phone, dates, numbers) are rejected client-side where implemented.
- [ ] **#086** Server validation errors (400/422) surface readable messages, not raw JSON dumps.
- [ ] **#087** Concurrent edit / stale data: second save shows conflict or overwrites per design—no silent failure.
- [ ] **#088** Long text and unicode in names/notes do not break tables or PDFs.
- [ ] **#089** Tables: column sort (where present) orders correctly.
- [ ] **#090** Tables: filters apply and clear without leaving the grid empty incorrectly.
- [ ] **#091** Pagination or virtual scroll: next/prev pages load; totals consistent.
- [ ] **#092** Empty search results show a clear empty state.
- [ ] **#093** Export / print (if any) matches on-screen filters.
- [ ] **#094** Loading indicators appear for slow calls and disappear on error.
- [ ] **#095** Toastr / snack messages for success and error are not duplicated on double click.

---

## Home

- [ ] **#096** Dashboard loads widgets and data for privileged user.
- [ ] **#097** Dashboard respects `dashboard.viewReport` / `compareAgainst` if enforced in UI.
- [ ] **#098** Employees list table loads, search, and row actions work.
- [ ] **#099** Employee create/edit (if in app) respects `employee.create`.
- [ ] **#100** View employee detail `/home/employees/view/:id` loads and back navigation works.
- [ ] **#101** Create employee category `/home/employees/category/create` form validates and saves.
- [ ] **#102** Announcements list/create/edit/delete aligns with `announcement` privileges.

---

## Customers

- [ ] **#103** Customer list table: data, search, navigation to view.
- [ ] **#104** Create customer form: validation, success path, appears in list.
- [ ] **#105** View customer `/customers/view/:customerId` shows full detail.
- [ ] **#106** Edit customer `/customers/edit` (or equivalent) updates and reflects in view.
- [ ] **#107** Share / transfer actions respect `customer.share` and `customer.transfer` if present in UI.

---

## Enquiry

- [ ] **#108** Enquiry board/list loads and filters work.
- [ ] **#109** Create enquiry: required fields, attachments (if any), success notification.
- [ ] **#110** Assign / presale flows (e.g. assign-presale) complete and notify assignee if applicable.
- [ ] **#111** State transitions (status changes) persist and show in table.
- [ ] **#112** Navigation to quotation creation from enquiry respects **#056** exception path.

---

## Assigned jobs

- [ ] **#113** Assigned jobs list table and actions.
- [ ] **#114** Upload estimations flow validates files/types and completes.
- [ ] **#115** Edit estimations path behaves same as upload where intended.
- [ ] **#116** Completed jobs list accurate vs job state.
- [ ] **#117** Reassigned jobs list and filters.

---

## Quotations

- [ ] **#118** Quotation list / report views load; filters and table columns correct.
- [ ] **#119** Create quotation: line items, totals, tax/discount math, save.
- [ ] **#120** Edit quotation: loads existing data; invalid edits rejected.
- [ ] **#121** View quotation: read-only integrity; print/PDF if applicable.
- [ ] **#122** Permissions: user without `quotation.create` cannot create except allowed enquiry path (**#056**).

---

## Deal sheet

- [ ] **#123** Pending deals table and actions.
- [ ] **#124** Approved deals table and actions.
- [ ] **#125** Deal sheet blocked entirely when `dealSheet` is false (**#058**).

---

## Job sheet

- [ ] **#126** Pending job list loads.
- [ ] **#127** Open-to-work and in-progress views behave differently if designed.
- [ ] **#128** Completed job list.
- [ ] **#129** Allocate / transfer actions respect `jobSheet.allocateJobs` and `jobSheet.transferProcurementPerson`.

---

## Profile

- [ ] **#130** Profile page loads current user data.
- [ ] **#131** Profile update form validation and persistence.

---

## Settings and categories

- [ ] **#132** Settings hub visible only with portal management flags (**#059**).
- [ ] **#133** Settings subsections (department, notes/terms, targets, customer type, etc.) each load and save.
- [ ] **#134** `/settings/category/create` category form works.
- [ ] **#135** `/settings/category/edit/:id` loads category, validates, saves.

---

## Suppliers

- [ ] **#136** Pending suppliers list and approve/reject flows respect `supplier.canApproveSupplier`.
- [ ] **#137** Approved suppliers list.
- [ ] **#138** Create supplier form validation and success.
- [ ] **#139** Edit supplier `/suppliers/edit/:id`.
- [ ] **#140** Supplier view `/suppliers/:id` detail consistency.

---

## Purchase requisitions

- [ ] **#141** Pending purchase list table and filters.
- [ ] **#142** Approved purchase list.
- [ ] **#143** Create purchase: validation, line items, job linkage if applicable.
- [ ] **#144** Edit purchase `/purchase/edit/:id`.
- [ ] **#145** View purchase `/purchase/view-purchase/:id` shows approvals, history, attachments.
- [ ] **#146** Supplier discount step `/purchase/supplier-discount/:purchaseId`.
- [ ] **#147** Comparison sheet `/purchase/comparison-sheet/:purchaseId` data and actions.
- [ ] **#148** Comparison summary `/purchase/comparison-summary/:purchaseId`.
- [ ] **#149** Approve PR action respects `purchase.canApprovePR` on UI and API.
- [ ] **#150** Initiate LPO `/purchase/initiate-lpo/:id` respects `purchaseOrder` privileges where applicable.
- [ ] **#151** Issue LPO `/purchase/issue-lpo/:id` and edit/reissue variants.

---

## Purchase order / LPO / GRN

- [ ] **#152** Pending approval queue `/purchase-order/pending-approval`.
- [ ] **#153** Approved LPO list `/purchase-order/approved`.
- [ ] **#154** View LPO `/purchase-order/view-lpo/:id`.
- [ ] **#155** Create GRN `/purchase-order/create-grn/:lpoId` validation and stock effect (if any).
- [ ] **#156** View GRN `/purchase-order/view-grn/:id`.
- [ ] **#157** Actions align with `canInitiateLPO`, `canApprovePOs`, `canReissueAndRevoke`.

---

## Technical / projects / material requests

- [ ] **#158** Projects list (`/technical/project`) and AMC variant if separate data.
- [ ] **#159** Add project `/technical/project/add` with `canDeactivate` prompt on dirty exit.
- [ ] **#160** Edit project `/technical/project/edit/:id` same as add for unsaved changes.
- [ ] **#161** Activity plan `/technical/project/activity-plan/:id`.
- [ ] **#162** Material request `/technical/project/material-request/:id` create/submit flows.
- [ ] **#163** Project updates list and view update detail routes.
- [ ] **#164** Tasks `/technical/project/tasks/:id`.
- [ ] **#165** Issues `/technical/project/issues/:id`.
- [ ] **#166** Claims from project `/technical/project/claims/:id`.
- [ ] **#167** Billing summary `/technical/project/billing-summary/:id`.
- [ ] **#168** Open to work project queue `/technical/open-to-work-project`.
- [ ] **#169** MR approval requests list `/technical/mr-approval-requests`.
- [ ] **#170** View MR `/technical/mr-approval-requests/view/:id` approve/reject and notifications (**#031–#033**).

---

## Claims (standalone module)

- [ ] **#171** My claims `/claims/my-claims` table and forms.
- [ ] **#172** Approval requests `/claims/approval-requests` for approvers only (**#067**).

---

## Inventory

- [ ] **#173** Products list `/inventory/products` table and search.
- [ ] **#174** Add product category `/inventory/products/category/add`.
- [ ] **#175** Stock entries `/inventory/stock-entries` table.
- [ ] **#176** Create stock entry `/inventory/stock-entries/create` validation and quantities.

---

## Dispatch

- [ ] **#177** Delivery note register table `/dispatch/delivery-note-register`.
- [ ] **#178** Create DN `/dispatch/delivery-note-register/create` (**#068**).
- [ ] **#179** View DN `/dispatch/delivery-note-register/view/:id`.
- [ ] **#180** Pending delivery reports (**#069**).
- [ ] **#181** Invoice linking report (**#070**).
- [ ] **#182** Inventory deduction report (**#071**).

---

## Invoice

- [ ] **#183** Invoice register table `/invoice/invoice-register`.
- [ ] **#184** Create invoice `/invoice/invoice-register/create` (**#073**).
- [ ] **#185** Edit invoice `/invoice/invoice-register/edit/:id`.
- [ ] **#186** Reissue `/invoice/invoice-register/reissue/:id`.
- [ ] **#187** View invoice `/invoice/invoice-register/view/:id`.
- [ ] **#188** Invoice–DN linking `/invoice/invoice-dn-linking` (**#074**).
- [ ] **#189** Cancelled invoices (**#075**).
- [ ] **#190** Reissued report (**#076**).

---

## Recycle, feedback, misc

- [ ] **#191** Recycle bin `/recycle` only for super admin (**#060**); restore/delete behaves correctly.
- [ ] **#192** Feedback requests `/feedback-requests` loads and actions complete.

---

## Server and API consistency (spot checks)

- [ ] **#193** Same action from UI returns same result as direct API call (status codes, body shape).
- [ ] **#194** Idempotent retries (double submit) do not duplicate critical records unless allowed.
- [ ] **#195** Large payloads (many line items) within documented limits succeed.
- [ ] **#196** CORS and auth headers on API from deployed client URL.

---

## Sign-off

| Area | Tester | Date | Notes |
|------|--------|------|-------|
| Notifications | | | |
| Validation | | | |
| Privileges | | | |
| Forms / tables | | | |

When reporting bugs, include: **ID**, steps, role used, expected vs actual, and screenshots or HAR if relevant.
