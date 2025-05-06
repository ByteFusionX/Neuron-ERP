import { NextFunction, Response, Request } from "express";
import Notes from '../models/note.model'
import mongoose from "mongoose";

export const createCustomerNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { note } = req.body;

        if (!note) {
            return res.status(400).json({ message: "Note is required" });
        }

        const newNote = {
            _id: new mongoose.Types.ObjectId(),
            note,
        };

        const updatedNotes = await Notes.findOneAndUpdate(
            {},
            { $push: { customerNotes: newNote } },
            { new: true, upsert: true }
        );
        res.status(200).json(updatedNotes);
    } catch (error) {
        console.log(error)
next(error)
    }
}

export const createTermsAndCondition = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { note } = req.body;

        if (!note) {
            return res.status(400).json({ message: "Note is required" });
        }

        const newNote = {
            _id: new mongoose.Types.ObjectId(),
            note,
        };

        const updatedNotes = await Notes.findOneAndUpdate(
            {},
            { $push: { termsAndConditions: newNote } },
            { new: true, upsert: true }
        );

        res.status(200).json(updatedNotes);
    } catch (error) {
        console.log(error)
next(error)
    }
}


export const updateNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const noteId = req.params.noteId;
        const { noteType, note } = req.body;

        let updateResult;
        if (noteType == 'customerNote') {
            updateResult = await Notes.findOneAndUpdate(
                { "customerNotes._id": noteId },
                { $set: { "customerNotes.$.note": note } },
                { new: true }
            );
        } else {
            updateResult = await Notes.findOneAndUpdate(
                { "termsAndConditions._id": noteId },
                { $set: { "termsAndConditions.$.note": note } },
                { new: true }
            );
        }
        if(updateResult){
            return res.status(200).json(updateResult);
        }

        return res.status(502).json()
    } catch (error) {
        console.log(error)
next(error)
    }
}

export const deleteNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {noteId,noteType} = req.params;
        const updateResult = await Notes.updateOne(
            { [`${noteType}._id`]: noteId },
            { $pull: { [noteType]: { _id: noteId } } }
        );
        
        if(updateResult.modifiedCount == 1){
            return res.status(200).json({success:true})
        }

        return res.status(502).json()
    } catch (error) {
        console.log(error)
next(error)
    }
}

export const getNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const notes = await Notes.findOne();
        if(!notes){
            const emptyNote = {
                customerNotes: [],
                termsAndConditions: []
            };
            const newNotes = await Notes.create(emptyNote);
            return res.status(200).json(newNotes);
        }

        if (notes) {
            return res.status(200).json(notes);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
next(error)
    }
}