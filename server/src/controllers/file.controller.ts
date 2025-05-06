import { Request, Response, NextFunction } from "express";
import { nextTick } from "process";
import Enquiry from "../models/enquiry.model";
import fs from "fs";
import path from "path";
import { File } from "../interface/enquiry.interface";
import { deleteFileFromAws, isFileAvailableInAwsBucket, getFileUrlFromAws } from "../common/aws-connect";
import fetch from 'node-fetch';
const { ObjectId } = require('mongodb')

export const DownloadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const fileName = req.query.file as string;
        const url = await getFileUrlFromAws(fileName);

        // Stream the file from S3 to the response
        const response = await fetch(url);
        if (!response) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        response.body.pipe(res);
    } catch (error) {
        console.error('An error occurred while processing the request:', error);
        console.log(error)
next(error);
    }
};

export const fetchFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filename = req.params.filename;
        const url = await getFileUrlFromAws(filename);

        // Stream the file from S3 to the response
        const response = await fetch(url);
        if (!response) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        response.body.pipe(res);
    } catch (error) {
        console.error('An error occurred while processing the request:', error);
        console.log(error)
next(error);
    }
}


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
