// Import necessary modules from AWS SDK v3
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import dotenv from 'dotenv';
import { promisify } from 'util';

// Load environment variables from .env file
dotenv.config();

const unlinkAsync = promisify(fs.unlink);

const s3Client = new S3Client({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESSKEYID!,
        secretAccessKey: process.env.AWS_SECRETACCESSKEY!
    },
    endpoint: process.env.AWS_ENDPOINT
});

export const uploadFileToAws = async (fileName: string, filePath: string, contentType?: string): Promise<string | void> => {
    const fileStream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
        fileStream.on('error', (streamErr) => {
            console.error('Stream error:', streamErr);
            reject('error');
        });

        s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: fileName,
            Body: fileStream,
            ContentType: contentType,
        }))
        .then(async () => {
            fileStream.close(); // ensures fd is closed even if upload completes
            if (fs.existsSync(filePath)) {
                try {
                    await unlinkAsync(filePath);
                    console.log('File deleted successfully. 👍');
                } catch (delErr) {
                    console.error('Error deleting file:', delErr);
                }
            }
            resolve('success');
        })
        .catch((err) => {
            console.error('Upload error:', err);
            reject('error');
        });
    });
};

// Generates a presigned PUT URL so the client can upload a file directly to
// S3 without routing the bytes through this server (Phase 2, Step 8).
export const getPresignedUploadUrl = async (
    keyPrefix: string,
    contentType: string
): Promise<{ uploadUrl: string; key: string }> => {
    const key = `${keyPrefix}/${Date.now()}-${crypto.randomUUID()}`;
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    return { uploadUrl, key };
};

// Export function to get a signed URL for downloading a file from AWS S3
export const getFileUrlFromAws = async (fileName: string, expireTime: number | null = null): Promise<string> => {
    try {
        // Check if the file is available in the AWS S3 bucket
        const check = await isFileAvailableInAwsBucket(fileName);

        if (check) {
            // Create a GetObjectCommand to retrieve the file from S3
            const objectGetParams = {
                Bucket: process.env.AWS_BUCKET_NAME, // Specify the AWS S3 bucket name
                Key: fileName, // Specify the file name
            };
            console.log(objectGetParams)

            const command = new GetObjectCommand(objectGetParams);
            console.log(command)
            const url = await getSignedUrl(s3Client, command, { expiresIn: expireTime ?? undefined });
            console.log(url)
            return url;
        } else {
            // Return an error message if the file is not available in the bucket
            return "error";
        }
    } catch (err) {
        // Handle any errors that occur during the process
        console.log("error ::", err);
        return "error";
    }
};

export const isFileAvailableInAwsBucket = async (fileName: string): Promise<boolean> => {
    try {
        console.log(process.env.AWS_BUCKET_NAME)

        // Check if the object exists
        const s3send = await s3Client.send(new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME, // Specify the AWS S3 bucket name
            Key: fileName, // Specify the file name
        }));

        console.log(s3send)

        // If the object exists, return true
        return true;
    } catch (err) {
        if (err.name === 'NotFound') {
            // File not found in AWS bucket, return false
            return false;
        } else {
            // Handle other errors
            return false;
        }
    }
};

export const deleteFileFromAws = async (fileName: string): Promise<string | void> => {
    try {
        // Configure the parameters for the S3 upload
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
        };
        // Upload the file to S3
        await s3Client.send(new DeleteObjectCommand(uploadParams)).then((data) => {
        });

    } catch (err) {
        console.error('Error ', err);
        return 'error';
    }
};