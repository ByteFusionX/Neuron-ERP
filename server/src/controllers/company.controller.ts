import { Request, Response, NextFunction } from "express";
import Company from "../models/company.model"
import { ObjectId } from "mongodb";
import { uploadFileToAws, getFileUrlFromAws } from "../common/aws-connect";

export const getCompanyDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const company = await Company.findOne({
            name: { $exists: true },
            description: { $exists: true },
            address: { $exists: true }
        }).select('name description address taxRegistrationNumber registrationNumber logo');

        if (company) {
            const companyData = company.toObject();
            if (companyData.logo) {
                companyData.logo = await getFileUrlFromAws(companyData.logo);
            }
            return res.status(200).json(companyData);
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};


export const updateCompanyDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyName, description, street, area, city, country, taxRegistrationNumber, registrationNumber } = req.body


        const companyUpdate = await Company.updateOne(
            {},
            {
                $set: {
                    name: companyName,
                    description: description,
                    address: {
                        street: street,
                        area: area,
                        city: city,
                        country: country
                    },
                    taxRegistrationNumber: taxRegistrationNumber,
                    registrationNumber: registrationNumber
                }
            },
            { upsert: true }
        );

        if (companyUpdate) {
            return res.status(200).json(companyUpdate)
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
next(error)

    }
}

export const uploadCompanyLogo = async (req: any, res: Response, next: NextFunction) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        await uploadFileToAws(file.filename, file.path);

        const companyUpdate = await Company.findOneAndUpdate(
            {},
            { $set: { logo: file.filename } },
            { upsert: true, new: true }
        );

        const logoUrl = await getFileUrlFromAws(file.filename);
        return res.status(200).json({ success: true, logo: logoUrl });
    } catch (error) {
        console.log(error)
        next(error);
    }
}


export const getCompanyTargets = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyTarget = await Company.findOne({
            targets: { $exists: true },
        }).select('targets');

        if (companyTarget) {
            return res.status(200).json({ targets: companyTarget.targets });
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};

export const setCompanyTarget = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { year, salesRevenue, grossProfit } = req.body;

        const existingCompany = await Company.findOne({
            targets: {
                $elemMatch: {
                    year: year
                }
            }
        });


        if (existingCompany) {
            return res.status(409).json({
                message: `Target with year ${year} already exists.`,
            });
        }

        const companyUpdate = await Company.findOneAndUpdate(
            {},
            {
                $push: {
                    targets: {
                        year,
                        salesRevenue,
                        grossProfit,
                    },
                }
            },
            { upsert: true, new: true }
        );

        if (companyUpdate) {
            return res.status(200).json(companyUpdate.targets);
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};

export const updateCompanyTarget = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const target = req.body;
        const targetId = req.params.targetId;

        const targetWithYearExists = await Company.findOne({
            targets: { $elemMatch: { year: target.year } }
        });

        if (targetWithYearExists) {
            
            const isDuplicate = targetWithYearExists.targets.some((t, i) =>
             t._id.toString() !== targetId && t.year === target.year
            );

            if (isDuplicate) {
                return res.status(409).json({
                    message: `A target with year ${target.year} already exists.`,
                });
            }
        }
        console.log(targetId)
        const companyUpdate = await Company.findOneAndUpdate(
            { "targets._id": targetId },
            { $set: { "targets.$": target } },
            { new: true }
        );
        

        if (companyUpdate) {
            return res.status(200).json(companyUpdate.targets);
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};
