import { Request, Response, NextFunction } from "express";
import { nextTick } from "process";
import Enquiry from "../models/enquiry.model";
import fs from "fs";
import path from "path";
import { File } from "../interface/enquiry.interface";
import {
    deleteFileFromAws,
    isFileAvailableInAwsBucket,
    getFileUrlFromAws,
} from "../common/aws-connect";
import fetch from "node-fetch";
const { ObjectId } = require("mongodb");

export const DownloadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const fileName = req.query.file as string;

        if (!fileName) {
            return res.status(400).json({ message: "File name is required" });
        }

        const url = await getFileUrlFromAws(fileName);

        // If S3 helper could not generate a signed URL, return 404 instead of
        // passing an invalid/relative URL to node-fetch
        if (!url || url === "error") {
            return res.status(404).json({ message: "File not found" });
        }

        const response = await fetch(url);

        if (!response || !response.ok || !response.body) {
            return res.status(404).json({ message: "File not found" });
        }

        const contentType = response.headers.get("content-type");
        if (contentType) {
            res.setHeader("Content-Type", contentType);
        }
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );
        // Stream the file from S3 to the client
        response.body.pipe(res);
    } catch (error) {
        console.error("An error occurred while processing the request:", error);
        next(error);
    }
};

export const fetchFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const filename = req.params.filename;

        if (!filename) {
            return res.status(400).json({ message: "File name is required" });
        }

        const url = await getFileUrlFromAws(filename);

        if (!url || url === "error") {
            return res.status(404).json({ message: "File not found" });
        }

        const response = await fetch(url);

        if (!response || !response.ok || !response.body) {
            return res.status(404).json({ message: "File not found" });
        }

        const contentType = response.headers.get("content-type");
        if (contentType) {
            res.setHeader("Content-Type", contentType);
        }
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${filename}"`
        );
        response.body.pipe(res);
    } catch (error) {
        console.error("An error occurred while processing the request:", error);
        next(error);
    }
};


export const deleteFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const fileName = req.query.file as string;
        const enquiryId = req.query.enquiryId;

        const fileExists = await isFileAvailableInAwsBucket(fileName);

        if (fileExists) {
            await deleteFileFromAws(fileName);
            const deleteFile = await Enquiry.updateOne(
                { "_id": new ObjectId(enquiryId) },
                { $pull: { "assignedFiles": { "filename": fileName } } }
            );
            if (deleteFile.modifiedCount) {
                res.status(200).json('File Deleted')
            }
        } else {
            await Enquiry.updateOne(
                { "_id": new ObjectId(enquiryId) },
                { $pull: { "assignedFiles": { "filename": fileName } } }
            );
        }
    } catch (error) {
        console.log(error)
next(error);
    }
}

export const clearAllPresaleFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enquiryId = req.query.enquiryId;
        const presaleFiles = await Enquiry.findById(enquiryId);
        for (const file of presaleFiles.assignedFiles as any[]) {
            const fileExists = await isFileAvailableInAwsBucket(file.filename);
            if (fileExists) {
                await deleteFileFromAws(file.filename);
            }
        }

        const deleteFile = await Enquiry.updateOne(
            { "_id": new ObjectId(enquiryId) },
            { $set: { "assignedFiles": [] } }
        );

        if (deleteFile.modifiedCount) {
            res.status(200).json('All Files Deleted');
        } else {
            res.status(404).send('Something went Wrong');
        }
    } catch (error) {
        console.log(error)
next(error);
    }
}
