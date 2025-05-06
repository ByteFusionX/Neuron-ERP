import { Schema } from "mongoose";
import { File } from "../interface/enquiry.interface";

const FilesSchema = new Schema<File>({
    fieldname: { type: String },
    originalname: { type: String },
    encoding: { type: String },
    mimetype: { type: String },
    destination: { type: String },
    filename: { type: String },
    path: { type: String },
    size: { type: Number },
});

export default FilesSchema