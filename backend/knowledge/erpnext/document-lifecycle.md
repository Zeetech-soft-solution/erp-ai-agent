---
title: Document Lifecycle in ERPNext
module: general
doctypes: All submittable doctypes
---

# Document Lifecycle in ERPNext

Every business transaction in ERPNext is a document (a record of a DocType).
Transactions that affect accounts or stock are "submittable": they move
through a fixed lifecycle controlled by the `docstatus` field. Understanding
this lifecycle is required before creating, changing or reporting on any
transaction.

## The three docstatus values

- **0 Draft**: the document is saved but has no effect on ledgers, stock or
  outstanding amounts. It can be edited freely and deleted.
- **1 Submitted**: the document is final. ERPNext posts its General Ledger
  entries and Stock Ledger entries at this moment and updates linked
  documents (for example, the billed percentage of a Sales Order). A
  submitted document cannot be edited, except for fields marked "Allow on
  Submit".
- **2 Cancelled**: the document has been reversed. ERPNext posts reversing
  ledger entries. A cancelled document stays in the system for audit and
  cannot be edited or submitted again.

Masters (Customer, Item, Supplier, Employee) are not submittable. They are
saved and edited, and can be disabled instead of cancelled.

## Save, submit, cancel, amend

- **Save** stores a draft. Validation runs (mandatory fields, links that must
  exist, numeric checks).
- **Submit** runs validation again plus the posting logic. If posting fails
  (for example, insufficient stock, a closed accounting period, or a missing
  account), ERPNext refuses the submit and returns a message that explains
  why. That message is the authority; it should be shown as returned.
- **Cancel** reverses a submitted document. ERPNext refuses to cancel a
  document while a later submitted document still links to it (for example,
  a Sales Invoice linked to a Payment Entry). The later document must be
  cancelled first.
- **Amend** creates a new draft copy of a cancelled document, named with a
  suffix (for example `SINV-0001-1`). This is the standard way to correct a
  submitted transaction: cancel, amend, correct, submit.

## Naming series

Document names come from a Naming Series (for example `SAL-ORD-.YYYY.-`).
The name is assigned on first save and never changes. References between
documents use these names.

## Linked documents and "Make" actions

Most transactions are created from the previous document in the flow
(Quotation to Sales Order, Sales Order to Delivery Note). The "Create" or
"Make" action maps fields across, links the new document to its source, and
lets ERPNext track progress, such as how much of an order has been delivered
or billed. Creating the next document from its source keeps that tracking
correct; creating it from scratch loses the link.

## Status versus docstatus

Many documents also have a human-readable `status` field (for example "To
Deliver and Bill", "Overdue", "Paid"). ERPNext computes this from docstatus
and linked documents. It is informational; the lifecycle itself is governed
by docstatus.

## Approval workflows

An organisation can add a Workflow to any DocType. A workflow adds named
states (for example "Pending Approval", "Approved", "Rejected"), a state
field (usually `workflow_state`), and transitions that say which role may
perform which action in which state. When a workflow is active, documents
move forward by workflow actions instead of the plain Submit button. Each
state maps to a docstatus, so an "Approved" state may submit the document.
The live definition can be read with the `workflow.describe` tool.

## Permissions

What a user may read, create, submit, cancel or amend is decided by Role
Permissions (DocPerm) and User Permissions in ERPNext. An action the user is
not allowed to perform is refused by ERPNext with a permission message.
