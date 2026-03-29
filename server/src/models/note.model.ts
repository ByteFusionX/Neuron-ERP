import { Schema, Document, model,Types } from "mongoose";

interface Note {
    _id: Types.ObjectId;
    note: string;
}

interface NotesDocument extends Document {
    customerNotes: Note[];
    termsAndConditions: Note[];
    placeOfDelivery: Note[];
    shippingTerms: Note[];
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
    placeOfDelivery: {
        type: [NoteSchema],
        required: true,
    },
    shippingTerms: {
        type: [NoteSchema],
        required: true,
    },
});

export default model<NotesDocument>("Notes", NotesSchema);
