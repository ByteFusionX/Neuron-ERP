import { Router } from "express";
import { getNote, updateNote, createCustomerNote, createTermsAndCondition, deleteNote } from "../controllers/note.controller";
const noteRouter = Router()

noteRouter.get('/',getNote)
noteRouter.patch('/:noteId',updateNote)
noteRouter.delete('/:noteId/:noteType',deleteNote)
noteRouter.post('/customerNote',createCustomerNote)
noteRouter.post('/termsCondition',createTermsAndCondition)


export default noteRouter