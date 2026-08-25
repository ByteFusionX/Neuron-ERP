import { Router } from "express";
import { getNote, updateNote, createCustomerNote, createTermsAndCondition, createPlaceOfDelivery, createShippingTerms, deleteNote } from "../controllers/note.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const noteRouter = Router()

// GET / is a shared lookup used when filling out quotations/enquiries
// (terms & conditions, shipping terms, etc.) — left ungated. Only
// creating/editing/deleting the note config itself is gated.
const manageNotes = requirePrivilege("portalManagement", "notesAndTerms");

noteRouter.get('/',getNote)
noteRouter.patch('/:noteId', manageNotes, updateNote)
noteRouter.delete('/:noteId/:noteType', manageNotes, deleteNote)
noteRouter.post('/customerNote', manageNotes, createCustomerNote)
noteRouter.post('/termsCondition', manageNotes, createTermsAndCondition)
noteRouter.post('/placeOfDelivery', manageNotes, createPlaceOfDelivery)
noteRouter.post('/shippingTerms', manageNotes, createShippingTerms)


export default noteRouter