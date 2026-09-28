# Flexible Workflow Implementation Guide

## Purpose

This document explains how to build a flexible workflow system for the ERP.

The goal is not to hard-code approval logic inside every module. The goal is to create one controlled workflow engine that can be used by different modules such as Enquiry, Presales, Quotation, Purchase Request, Purchase Order, GRN, Project, Delivery, Invoice, Claims, and others.

The system should support both:

- Approval workflows: when someone must approve or reject a document.
- Handover workflows: when work moves from one person, role, or department to another.

## Revised Strategy (read this before building anything)

The original version of this guide described the full end-state: every one of the 18 modules from Enquiry to Credit Note wired into one generic engine, with rules, limits, delegation, escalation, locking, and auto-actions everywhere at once. That is still the long-term shape worth aiming for, but building it all at once is not the plan anymore, for concrete reasons:

- It touches ~18 modules simultaneously with no automated test suite and no browser verification available in this environment — regression risk is high and hard to detect.
- Field locking and auto-actions (auto-create job/PO/invoice) have a large blast radius if a workflow definition is misconfigured — bad data gets created or legitimate edits get silently blocked.
- Auth is mid-migration (JWT now, Azure AD later per `CLAUDE.md`) — building responsibility/approver resolution deeply into the JWT model now means re-plumbing it again later.
- Escalation/delegation need a background job runner that doesn't exist yet — that's infrastructure work, not app code.
- A generic engine is only real if every module's underlying routes are gated behind it — otherwise the raw update/status routes stay directly callable and the approval step is decorative.

So the plan is: **close existing gating gaps first, build the minimum engine second, prove it on one real approval scenario, then expand module by module only as concrete pain points show up.** Do not build Rules, Limits, Escalation, Delegation, Auto Actions, or connect more than one module until the current step is confirmed working.

## Status

- **Phase 0 — Close existing gating gaps: DONE.** Enquiry router and Quotation router now have `requireUnlessDenied` gates on their previously-open action routes, and the Deal Sheet visibility bug (Sales Manager unable to see Deal Sheets created under a superadmin session) is fixed. See `neuronerp_enquiry_router_missing_action_gates`, `neuronerp_quotation_router_missing_action_gates`, `neuronerp_dealsheet_visibility_bug` memory notes for history — QA/browser verification of the Deal Sheet fix is still outstanding.
- **Phase 1+ — Engine build: NOT STARTED.** Waiting on a confirmed, specific approval scenario to build against (see "First Scenario To Build" below) rather than building the generic engine speculatively.

## Core Idea

A flexible workflow should answer these questions:

1. Which module does this workflow apply to?
2. At what point should the workflow start?
3. What condition should trigger it?
4. Who should receive the work or approval?
5. Should the steps happen one by one or in parallel?
6. What happens if someone does not act on time?
7. What happens if the responsible person is on leave?
8. What should happen after the workflow is completed?

## Main Building Blocks

### 1. Roles And Privileges

Roles and privileges decide what a user is allowed to do in the system.

```text
Roles & Privileges = What the user is allowed to do
```

A Finance Manager may have privilege to approve invoices. But that does not mean every invoice should go to that Finance Manager. The workflow and responsibility settings decide which Finance Manager gets it.

This block is the one Phase 0 already partially addresses at the route level for Enquiry and Quotation. Any new module the engine touches must have the same route-level gating in place before workflow steps are layered on top — otherwise the workflow can be bypassed entirely.

### 2. Responsibilities

Responsibilities decide who owns a specific type of work — different from privileges.

```text
Responsibilities = Who owns this work
```

Five users may share the Sales Manager role and all have permission to approve quote discounts, but only one may be responsible for the Riyadh branch or the Projects department.

Recommended responsibility fields: Employee, Role, Department, Branch, Project, Module, Document type, Responsibility type, Backup person, Active from, Active to, Is active.

```text
Role: Sales Manager
Branch: Riyadh
Module: Quotation
Responsibility: Quote discount approval
Backup: Assistant Sales Manager
```

Lookups here must resolve the actual current owner, not just the record creator's session identity — this is the same class of bug fixed in Phase 0 for the Deal Sheet module, and it will recur anywhere responsibility resolution is added if not handled the same way.

### 3. Rules

Rules decide when a workflow is needed.

```text
Rules = Should workflow start?
```

Examples: PO amount above 25,000 requires approval; quote discount above 10% requires Sales Manager approval; enquiry type of project routes to Presales.

Possible condition fields: Amount, Discount percentage, Department, Branch, Project, Vendor, Customer, Document type, Status, Created by, Requested by, Payment terms, Credit limit.

Possible operators: Equals, Not equals, Greater than, Greater than or equal, Less than, Less than or equal, In list, Not in list, Exists, Does not exist.

Not built yet — deferred until the first real scenario needs it. Keep the first version to one hardcoded condition per workflow rather than a general condition builder.

### 4. Limits

Limits decide how much authority a person or role has.

```text
Limits = Can this person approve this value?
```

Sales Manager can approve quote discount up to 10%; Sales Director up to 25%; Purchase Manager can approve PO up to 25,000; Director up to 100,000.

Limits should be checked during approval, not only when assigning the workflow. If a PO is 80,000 and routed to a Purchase Manager with a 25,000 limit, the workflow should require a higher approver or escalate.

Not built yet.

### 5. Workflow

Workflow decides how the document moves.

```text
Workflow = Who gets it next, and what happens after that?
```

A workflow contains: name, module, trigger point, conditions, steps, step type, approver/responsible role, sequential or parallel behavior, escalation timing, delegation behavior, locking behavior, final action.

## How They Work Together

```text
User performs action in module
        ↓
Check role privilege
        ↓
Check rules
        ↓
If rule matched, start workflow
        ↓
Find responsible person or role
        ↓
Check approval limits
        ↓
Create workflow steps
        ↓
Approve / reject / handover / escalate / delegate
        ↓
Complete workflow
        ↓
Run final action
```

## Workflow Types

### Approval Workflow

Use when a document needs approval before it can move forward.

Examples: Quote discount approval, Purchase request approval, Purchase order approval, Claim approval, Invoice approval, Credit note approval, Vendor approval.

Behavior: Submit → Pending approval → Approved / Rejected / Escalated / Delegated → Locked after approval.

### Handover Workflow

Use when responsibility moves from one person or department to another.

Examples: Enquiry to Presales, Sales to Projects, Procurement to Stores, Stores to Project team, Project team to Delivery, Delivery to Finance.

Behavior: Assign → Accept handover → Return for clarification → Complete handover, with tracking of who handed over/received and due date.

Handover workflow does not always need approval — sometimes it only needs ownership transfer and status tracking.

## First Scenario To Build (pick one, do not start more than one)

Before touching the generic engine model, agree on one real, currently-painful approval scenario and build only that — hardcoded where the guide would otherwise say "configurable." Candidates carried over from the full module list below, in likely order of value:

1. **Quotation discount approval** — discount above a fixed threshold requires Sales Manager approval before the quote can be sent; price/discount fields lock while pending.
2. **Purchase Order approval** — PO above a fixed amount requires Purchase Manager → Finance Manager approval before it can go to the supplier.
3. **Deal Sheet approval** — already has partial approve/reject/revoke plumbing (`dealSheet` privilege, `approveDeal`/`rejectDeal`/`revokeDeal`); extending this may be cheaper than starting fresh elsewhere.

Whichever is chosen, the first build should be as small as possible: one module, one trigger, one hardcoded condition, one sequential approval chain, no parallel steps, no limits table, no delegation, no escalation, no auto-actions. Those get added later, one at a time, only once the first one is live and confirmed working.

## Full Module List (reference only — not a build order)

This is the complete map of where workflow could eventually apply, kept for reference. It is not a queue to work through — each entry gets built only when picked as a concrete next scenario.

1. **Enquiry** — assign to sales person, send technical enquiry to Presales, escalate if unassigned.
2. **Presales / Technical Review** — assign to Presales engineer, request clarification, complete review, return to Sales.
3. **Quotation** — review before sending, approve discount, lock price fields after approval.
4. **Customer Acceptance / Quote Won** — confirm acceptance, attach LPO, move to deal sheet or job creation.
5. **Deal Sheet** — Sales submits, Finance reviews payment terms, Management approves special terms, create job/project after approval.
6. **Job / Project Creation** — auto-create from accepted quote, assign project manager, notify operations.
7. **Project / Job Assignment** — assign responsible team, accept assignment, escalate if not accepted.
8. **Job Sheet** — Pending → Open to Work → In Progress → Completed, reassignment, SLA escalation, lock on Completed.
9. **Material Request** — project team requests, Project Manager approves, Procurement receives.
10. **Purchase Request** — Department/Project Manager approval, Finance review, convert to purchase process.
11. **Supplier Comparison / Selection** — compare prices, approve selection, exception approval.
12. **Purchase Order** — approve by amount, Director approval for high value, lock after approval.
13. **GRN / Goods Receiving** — confirm received goods, handle mismatch, dispute routing.
14. **Stock Hold / Stock Issue** — hold disputed stock, approve release/return.
15. **Project Execution** — assign tasks, approve changes, escalate delayed tasks, cost approval.
16. **Delivery Note / Dispatch** — approve delivery, confirm goods ready, warehouse-to-delivery handover.
17. **Invoice** — create/review, approval for special terms, lock after posting.
18. **Credit Note / Reissue** — approve correction, approve credit note, reissue invoice.

## Build Order For The Engine Itself (once a scenario is picked)

Build in this order, and stop after each step to confirm it works before adding the next:

1. **Common workflow engine core** — start workflow, evaluate condition, create instance, create tasks, complete step, reject, move to next step, complete workflow. Hardcode the one condition for the chosen scenario rather than building a condition UI.
2. **Connect roles/privileges** — reuse the existing `requirePrivilege`/`requireUnlessDenied` middleware pattern already used in enquiry/quotation routers; don't invent a parallel authorization mechanism.
3. **Responsibility resolution for the one scenario** — module + role + employee lookup, resolving actual current owner (reuse the `reportingTo`/admin-authored-employee resolution pattern already fixed for Deal Sheet).
4. **Sequential approval steps** for the chosen scenario only.
5. **Field locking** for that module while pending/after approval — ask "can this field be edited now" from the engine rather than hardcoding per-module lock logic, but only for the fields that scenario actually needs locked.
6. **Workflow history** — record who acted, when, from/to status. Needed from the start for audit trust, not deferred.

Everything below is explicitly **not** part of the first build and should only be added once the above is live and stable, one at a time, against a real need:

- Parallel approval steps (same order number, multiple approvers)
- Configurable rules/condition builder (replace the hardcoded condition)
- Approval limits table (per-role/employee value ceilings)
- Leave delegation
- 48-hour escalation (needs a background job runner — infrastructure work)
- Auto actions (auto-create job/PO/invoice on completion)
- Connecting a second module

## Recommended Data Model (for when Step 1 above is actually implemented)

Keep this as the target shape, but only create the fields/collections the chosen scenario needs — don't pre-build the full model for modules not yet connected.

### Workflow Template

```text
name
type: approval | handover
module
trigger
conditions
steps
autoActions
lockingRules
active
```

### Workflow Step

```text
order
stepName
stepType: approval | handover | review | notification
approverType: employee | role | responsibility
employee
role
responsibilityType
parallelGroup
requiredAction
escalationHours
escalationToEmployee
escalationToRole
allowDelegation
```

### Workflow Instance

```text
workflowTemplate
module
documentId
status
currentOrder
startedBy
startedAt
completedAt
```

### Workflow Task

```text
workflowInstance
step
assignedTo
assignedRole
status
assignedAt
actedAt
actionBy
comment
delegatedFrom
escalatedFrom
dueAt
```

### Workflow History

```text
workflowInstance
module
documentId
action
fromStatus
toStatus
performedBy
assignedTo
comment
createdAt
```

## Recommended Common Module Fields (add only to the module actually being connected)

```text
workflowStatus
workflowId
workflowInstanceId
currentStep
pendingWith
approvalStatus
handoverStatus
submittedAt
approvedAt
rejectedAt
completedAt
```

## Important Rules To Keep The System Clean

1. Do not hard-code approval paths inside each module once the engine exists — but it's fine for the first scenario's condition to be hardcoded rather than configurable.
2. Let modules trigger workflow, but let workflow decide the path.
3. Keep rules separate from limits, once both exist.
4. Keep privileges separate from responsibilities.
5. Keep approval workflow separate from handover workflow.
6. Keep full history for every action, from the first version.
7. Start with one module and one simple condition before adding condition groups or more modules.
8. Every module the engine touches must already have route-level privilege gating (Phase 0 pattern) — otherwise the workflow step is bypassable.
9. Always show users where the document is pending.
10. Always allow admins to deactivate a workflow without deleting history.

## Final Simple Definitions

```text
Roles & Privileges = What a user can do
Responsibilities = What a user owns
Rules = When workflow should start
Limits = How much a user can approve
Workflow = How the document moves
Delegation = Who acts when someone is unavailable
Escalation = What happens when someone delays
Auto Action = What the system creates or updates after completion
History = Proof of what happened
```
