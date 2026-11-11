import { Router } from "express";
import { getNote, updateNote, createCustomerNote, createTermsAndCondition, createPlaceOfDelivery, createShippingTerms, createPurchaseTermsNote, deleteNote } from "../controllers/note.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const noteRouter = Router()

// GET / is a shared lookup used when filling out quotations/enquiries
// (terms & conditions, shipping terms, etc.) — left ungated. Only
// creating/editing/deleting the note config itself is gated.
const manageNotes = requirePrivilege("portalManagement", "notesAndTerms");

const canInitiateLpo = requirePrivilege("purchaseOrder", "canInitiateLPO");

noteRouter.get('/',getNote)
noteRouter.patch('/:noteId', manageNotes, updateNote)
noteRouter.delete('/:noteId/:noteType', manageNotes, deleteNote)
noteRouter.post('/customerNote', manageNotes, createCustomerNote)
noteRouter.post('/termsCondition', manageNotes, createTermsAndCondition)
// Issuing an LPO auto-saves new place-of-delivery / shipping-terms values, so users who can
// initiate LPOs may add these notes without the full notesAndTerms privilege.
const manageOrInitiateLpo = (req: any, res: any, next: any) =>
    manageNotes(req, { status: () => ({ json: () => canInitiateLpo(req, res, next) }) } as any, next);

noteRouter.post('/placeOfDelivery', manageOrInitiateLpo, createPlaceOfDelivery)
noteRouter.post('/shippingTerms', manageOrInitiateLpo, createShippingTerms)
noteRouter.post('/purchaseTermsNotes', manageOrInitiateLpo, createPurchaseTermsNote)


export default noteRouter