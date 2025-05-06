import { Schema, Document, model,Types } from "mongoose";

interface Note {
    _id: Types.ObjectId;
    note: string;
}

interface NotesDocument extends Document {
    customerNotes: Note[];
    termsAndConditions: Note[];
}

const NoteSchema = new Schema<Note>({
    note: {
        type: String,
        required: true,
    },
});

const NotesSchema = new Schema<NotesDocument>({
    customerNotes: {
        type: [NoteSchema],
        required: true,
    },
    termsAndConditions: {
        type: [NoteSchema],
        required: true,
    },
});

export default model<NotesDocument>("Notes", NotesSchema);
