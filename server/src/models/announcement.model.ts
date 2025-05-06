import { Schema, Document, model, Types } from "mongoose";

interface announcment extends Document {
    title: String
    description: String
    date: Date
    createdDate: Date,
    celeb: boolean
    viewedBy: string[]
    category: string[]
    createdBy: Types.ObjectId
}

const AnnouncementSchema = new Schema<announcment>({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    createdDate: {
        type: Date
    },
    date: {
        type: Date,
        required: true
    },
    celeb: {
        type: Boolean,
        required: true
    },
    viewedBy: {
        type: [String]
    },
    category: {
        type: [String]
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    }
});

export default model<announcment>("Announcement", AnnouncementSchema);

