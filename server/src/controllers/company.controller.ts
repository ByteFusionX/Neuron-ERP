import { Request, Response, NextFunction } from "express";
import Company from "../models/company.model"
import { ObjectId } from "mongodb";

export const getCompanyDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const company = await Company.findOne({
            name: { $exists: true },
            description: { $exists: true },
            address: { $exists: true }
        }).select('name description address');

        if (company) {
            return res.status(200).json(company);
        }
        return res.status(204).json();
    } catch (error) {
        console.log(error)
next(error);
    }
};


export const updateCompanyDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyName, description, street, area, city, country } = req.body


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
                    }
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
