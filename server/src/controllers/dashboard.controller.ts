import { NextFunction, Request, Response } from "express"
import quotationModel from "../models/quotation.model";
import { ObjectId } from "mongodb"
import employeeModel from "../models/employee.model";
import jobModel from "../models/job.model";
import { buildDashboardFilters, calculateCostPricePipe, calculateDiscountPrice, calculateTotalCost, getUSDRated, lastRangedMonths, months, calculateDiscountPricePipe, getDateRange, calculateQuoteDiscountPricePipe } from "../common/util";
import categoryModel, { Privileges } from "../models/category.model";
import { Filters } from "../interface/dashboard.interface";
import enquiryModel from "../models/enquiry.model";


export const getDashboardMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;

            const dashboardMetrics: { name: string; type: string; value: number; lastWeek: number, lastWeekName: string, rank: number }[] = [];

            const metricsMap = {
                revenue: {
                    privilege: privileges.jobSheet.viewReport,
                    method: getRevenueAchieved,
                    metrics: [
                        { name: 'Revenue Achieved', type: 'QAR', key: 'totalSellingPrice', lastKey: 'lastWeekSellingPrice', lastWeekName: 'revenue', rank: 1 },
                        { name: 'Gross Profit', type: 'QAR', key: 'grossProfit', lastKey: 'lastWeekGrossProfit', lastWeekName: 'profit', rank: 2 },
                        { name: 'Total Job Awarded', type: 'No.', key: 'totalJobAwarded', lastKey: 'lastWeekJobAwarded', lastWeekName: 'job awarded', rank: 6 },
                    ]
                },
                invoiced: {
                    privilege: privileges.jobSheet.viewReport,
                    method: getInvoicedData,
                    metrics: [
                        { name: 'Invoiced Gross Profit', type: 'QAR', key: 'totalInvoicedProfit', lastKey: 'lastWeekInvoicedProfit', lastWeekName: 'invoiced profit', rank: 12 },
                        { name: 'Total Job Invoiced', type: 'No.', key: 'totalInvoicedJobs', lastKey: 'lastWeekInvoicedJobs', lastWeekName: 'invoiced', rank: 11 },
                    ]
                },
                enquiry: {
                    privilege: privileges.enquiry.viewReport,
                    method: getEnquiriesCount,
                    metrics: [
                        { name: 'Total No. oF Enquiries', type: 'No.', key: 'totalEnquiries', lastKey: 'lastWeekEnquiries', lastWeekName: 'enquiries', rank: 3 },
                    ]
                },
                quotations: {
                    privilege: privileges.quotation.viewReport,
                    method: getQuotations,
                    metrics: [
                        { name: 'Total No. oF Quote Submitted', type: 'No.', key: 'totalQuotations', lastKey: 'lastWeekQuotations', lastWeekName: 'quoations', rank: 4 },
                        { name: 'Total Submitted Quote Value', type: 'QAR', key: 'totalQuoteValue', lastKey: 'lastWeekQuoteValue', lastWeekName: 'quote valued', rank: 5 },
                    ]
                },
                assignedJobs: {
                    privilege: privileges.assignedJob.viewReport,
                    method: getAssignedJobs,
                    metrics: [
                        { name: 'No. of Assigned Jobs', type: 'No.', key: 'totalAssignedJobs', lastKey: 'lastWeekAssignedJobs', lastWeekName: 'assigned jobs', rank: 7 },
                        { name: 'No. of Completed Jobs', type: 'No.', key: 'totalCompletedJob', lastKey: 'lastWeekCompletedJob', lastWeekName: 'completed jobs', rank: 8 },
                        { name: 'Jobs Awarded from Assigned Jobs', type: 'No.', key: 'jobAwarded', lastKey: 'lastWeekJobAwarded', lastWeekName: 'jobs awarded', rank: 9 },
                        { name: 'Revenue from Assigned Jobs', type: 'QAR', key: 'revenue', lastKey: 'lastWeekRevenue', lastWeekName: 'revenue', rank: 10 },
                    ]
                },
            };

            const metricsPromises = Object.entries(metricsMap).map(async ([key, value]) => {
                if (value.privilege !== 'none') {
                    const revenueAchieved = await value.method(value.privilege, userId, filters);
                    return value.metrics.map(metric => ({
                        name: metric.name,
                        type: metric.type,
                        value: revenueAchieved ? revenueAchieved[metric.key] : 0,
                        lastWeek: revenueAchieved ? revenueAchieved[metric.lastKey] : 0,
                        rank: metric.rank,
                        lastWeekName: metric.lastWeekName,
                    }));
                }
                return [];
            });

            const results = await Promise.all(metricsPromises);

            results.forEach(metrics => dashboardMetrics.push(...metrics));

            return res.status(200).json(dashboardMetrics);
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}



const getRevenueAchieved = async (access: string, userId: string, filters: Filters) => {
    try {
        let accessFilter = {};

        let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
        let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

        switch (access) {
            case 'created':
                accessFilter = { 'salesPerson._id': new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const qatarUsdRate = await getUSDRated();

        const currentDate = new Date();
        const sevenDaysAgo = new Date(currentDate);
        sevenDaysAgo.setDate(currentDate.getDate() - 7);

        const jobTotal = await jobModel.aggregate([
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: buildDashboardFilters(filters, accessFilter)
            },
            {
                $addFields: {
                    totalSellingPrice: {
                        $round: [ // Ensure totalSellingPrice is rounded to 2 decimals
                            {
                                $sum: [
                                    {
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $round: [ // Round USD conversion
                                                    {
                                                        $multiply: [
                                                            calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                                            qatarUsdRate
                                                        ]
                                                    },
                                                    2
                                                ]
                                            },
                                            calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                                        ]
                                    },
                                    {
                                        $reduce: {
                                            input: '$quotation.dealData.additionalCosts',
                                            initialValue: 0,
                                            in: {
                                                $cond: [
                                                    { $eq: ['$$this.type', 'Customer Discount'] },
                                                    {
                                                        $round: [ // Round discount adjustment
                                                            { $subtract: ['$$value', '$$this.value'] },
                                                            2
                                                        ]
                                                    },
                                                    '$$value'
                                                ]
                                            }
                                        }
                                    }
                                ]
                            },
                            2
                        ]
                    },
                    totalCostPrice: {
                        $round: [ // Ensure totalCostPrice is rounded to 2 decimals
                            {
                                $sum: [
                                    {
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $round: [ // Round USD conversion
                                                    {
                                                        $multiply: [
                                                            calculateCostPricePipe('$quotation.dealData.updatedItems'),
                                                            qatarUsdRate
                                                        ]
                                                    },
                                                    2
                                                ]
                                            },
                                            calculateCostPricePipe('$quotation.dealData.updatedItems')
                                        ]
                                    },

                                ]
                            },
                            2
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSellingPrice: { $sum: '$totalSellingPrice' },
                    totalCostPrice: { $sum: '$totalCostPrice' },
                    lastWeekSellingPrice: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                '$totalSellingPrice',
                                0
                            ]
                        }
                    },
                    lastWeekCostPrice: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                '$totalCostPrice',
                                0
                            ]
                        }
                    },
                    totalJobAwarded: { $sum: 1 },
                    lastWeekJobAwarded: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                1,
                                0
                            ]
                        }
                    },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalSellingPrice: { $round: ['$totalSellingPrice', 2] },
                    lastWeekSellingPrice: { $round: ['$lastWeekSellingPrice', 2] },
                    totalCostPrice: { $round: ['$totalCostPrice', 2] },
                    lastWeekCostPrice: { $round: ['$lastWeekCostPrice', 2] },
                    grossProfit: {
                        $round: [
                            { $subtract: ['$totalSellingPrice', '$totalCostPrice'] },
                            2
                        ]
                    },
                    lastWeekGrossProfit: {
                        $round: [
                            { $subtract: ['$lastWeekSellingPrice', '$lastWeekCostPrice'] },
                            2
                        ]
                    },
                    totalJobAwarded: 1,
                    lastWeekJobAwarded: 1
                }
            }

        ]).exec();

        console.log(jobTotal[0])

        return jobTotal[0];
    } catch (error) {
        console.error(error);
    }
}

const getInvoicedData = async (access: string, userId: string, filters: Filters) => {
    try {
        let accessFilter = {};

        let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
        let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

        switch (access) {
            case 'created':
                accessFilter = { 'salesPerson._id': new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const qatarUsdRate = await getUSDRated();

        const currentDate = new Date();
        const sevenDaysAgo = new Date(currentDate);
        sevenDaysAgo.setDate(currentDate.getDate() - 7);

        // Add status filter for 'Invoiced' jobs
        const statusFilter = { 'status': 'Invoiced' };
        // Combine with other filters
        const combinedFilter = { ...buildDashboardFilters(filters, accessFilter), ...statusFilter };

        const invoicedJobTotal = await jobModel.aggregate([
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: combinedFilter
            },
            {
                $addFields: {
                    invoicedProfit: {
                        $round: [
                            { 
                                $subtract: [
                                    { 
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $multiply: [
                                                    calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                                    qatarUsdRate
                                                ]
                                            },
                                            calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                                        ]
                                    },
                                    { 
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $multiply: [
                                                    calculateCostPricePipe('$quotation.dealData.updatedItems'),
                                                    qatarUsdRate
                                                ]
                                            },
                                            calculateCostPricePipe('$quotation.dealData.updatedItems')
                                        ]
                                    }
                                ]
                            },
                            2
                        ]
                    },
                    isUpdatedLastWeek: {
                        $gte: ['$updatedDate', sevenDaysAgo]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalInvoicedProfit: { $sum: '$invoicedProfit' },
                    lastWeekInvoicedProfit: {
                        $sum: {
                            '$cond': [
                                '$isUpdatedLastWeek',
                                '$invoicedProfit',
                                0
                            ]
                        }
                    },
                    totalInvoicedJobs: { $sum: 1 },
                    lastWeekInvoicedJobs: {
                        $sum: {
                            '$cond': [
                                '$isUpdatedLastWeek',
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalInvoicedProfit: { $round: ['$totalInvoicedProfit', 2] },
                    lastWeekInvoicedProfit: { $round: ['$lastWeekInvoicedProfit', 2] },
                    totalInvoicedJobs: 1,
                    lastWeekInvoicedJobs: 1
                }
            }
        ]).exec();

        return invoicedJobTotal[0] || { 
            totalInvoicedProfit: 0, 
            lastWeekInvoicedProfit: 0,
            totalInvoicedJobs: 0,
            lastWeekInvoicedJobs: 0
        };
    } catch (error) {
        console.error(error);
        return { 
            totalInvoicedProfit: 0, 
            lastWeekInvoicedProfit: 0,
            totalInvoicedJobs: 0,
            lastWeekInvoicedJobs: 0
        };
    }
}

const getEnquiriesCount = async (access: string, userId: string, filters: Filters) => {
    try {

        let accessFilter = {};

        let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
        let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

        switch (access) {
            case 'created':
                accessFilter = { 'salesPerson._id': new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                break;

            default:
                break;
        }
        const currentDate = new Date();
        const sevenDaysAgo = new Date(currentDate);
        sevenDaysAgo.setDate(currentDate.getDate() - 7);

        const enqTotal = await enquiryModel.aggregate([
            { $match: { status: { $ne: 'Quoted' } } },
            {
                $lookup: { from: 'employees', localField: 'salesPerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: buildDashboardFilters(filters, accessFilter)
            },
            {
                $group: {
                    _id: null,
                    totalEnquiries: { $sum: 1 },
                    lastWeekEnquiries: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                1,
                                0
                            ]
                        }
                    },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalEnquiries: 1,
                    lastWeekEnquiries: 1
                }
            }
        ]).exec();

        return enqTotal[0];
    } catch (error) {
        console.error(error);
    }
}

const getQuotations = async (access: string, userId: string, filters: Filters) => {
    try {
        let accessFilter = {};

        let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
        let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }

        const currentDate = new Date();
        const sevenDaysAgo = new Date(currentDate);
        sevenDaysAgo.setDate(currentDate.getDate() - 7);

        const qatarUsdRate = await getUSDRated();

        const quoteTotal = await quotationModel.aggregate([
            {
                $match: {
                    status: { $ne: 'Work In Progress' }
                }
            },
            {
                $addFields: {
                    createdDate: "$date"
                }
            },
            {
                $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: buildDashboardFilters(filters, accessFilter)
            },
            {
                $addFields: {
                    totalSellingPrice: {
                        $sum: {
                            $cond: [
                                { $eq: ['$currency', 'USD'] },
                                {
                                    $multiply: [
                                        calculateQuoteDiscountPricePipe('$optionalItems'),
                                        qatarUsdRate
                                    ]
                                },
                                calculateQuoteDiscountPricePipe('$optionalItems')
                            ]
                        }
                    },
                }
            },
            {
                $group: {
                    _id: null,
                    totalQuotations: { $sum: 1 },
                    lastWeekQuotations: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                1,
                                0
                            ]
                        }
                    },
                    totalQuoteValue: { $sum: '$totalSellingPrice' },
                    lastWeekQuoteValue: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', sevenDaysAgo] },
                                '$totalSellingPrice',
                                0
                            ]
                        }
                    },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalQuotations: 1,
                    lastWeekQuotations: 1,
                    totalQuoteValue: 1,
                    lastWeekQuoteValue: 1
                }
            }
        ]).exec();

        return quoteTotal[0];
    } catch (error) {
        console.error(error);
    }
}


const getAssignedJobs = async (access: string, userId: string, filters: Filters) => {
    try {
        let accessFilter: any = {};
        switch (access) {
            case 'assigned':
                accessFilter['salesPerson._id'] = new ObjectId(userId);
                break;
            default:
                break;
        }

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const assignedJobCount = await enquiryModel.aggregate([
            {
                $unset: "createdDate"
            },
            {
                $addFields: {
                    createdDate: { $toDate: "$preSale.createdDate" }
                }
            },
            {
                $lookup: { from: 'employees', localField: 'preSale.presalePerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: buildDashboardFilters(filters, accessFilter)
            },
            {
                $facet: {
                    totalCount: [
                        {
                            $match: {
                                status: 'Assigned To Presales'
                            }
                        },
                        { $count: "total" }
                    ],
                    lastWeekCount: [
                        {
                            $match: {
                                createdDate: { $gte: oneWeekAgo },
                                status: 'Assigned To Presales'
                            }
                        },
                        { $count: "lastWeek" }
                    ],
                    totalCompletedJob: [
                        {
                            $match: {
                                status: { $ne: 'Assigned To Presales' }
                            }
                        },
                        { $count: "total" }
                    ],
                    lastWeekCompletedJob: [
                        {
                            $match: {
                                createdDate: { $gte: oneWeekAgo },
                                status: { $ne: 'Assigned To Presales' }
                            }
                        },
                        { $count: "lastWeek" }
                    ],
                }
            },
            {
                $project: {
                    totalAssignedJobs: { $ifNull: [{ $arrayElemAt: ["$totalCount.total", 0] }, 0] },
                    lastWeekAssignedJobs: { $ifNull: [{ $arrayElemAt: ["$lastWeekCount.lastWeek", 0] }, 0] },
                    totalCompletedJob: { $ifNull: [{ $arrayElemAt: ["$totalCompletedJob.total", 0] }, 0] },
                    lastWeekCompletedJob: { $ifNull: [{ $arrayElemAt: ["$lastWeekCompletedJob.lastWeek", 0] }, 0] },
                }
            }
        ]).exec();




        let accessFilterForAwarded: any = { 'enquiry.status': 'Quoted' };
        switch (access) {
            case 'assigned':
                accessFilter['enquiry.preSale.presalePerson'] = new ObjectId(userId);
                break;
            default:
                break;
        }


        const qatarUsdRate = await getUSDRated();


        const assignedJobAwarded = await jobModel.aggregate([
            {
                $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
            },
            {
                $unwind: "$quotation"
            },
            {
                $lookup: { from: 'enquiries', localField: 'quotation.enqId', foreignField: '_id', as: 'enquiry' }
            },
            {
                $unwind: "$enquiry"
            },
            {
                $lookup: { from: 'employees', localField: 'enquiry.preSale.presalePerson', foreignField: '_id', as: 'salesPerson' }
            },
            {
                $lookup: { from: 'departments', localField: 'enquiry.department', foreignField: '_id', as: 'department' }
            },
            {
                $unwind: "$salesPerson"
            },
            {
                $unwind: "$department"
            },
            {
                $match: { ...accessFilterForAwarded, ...buildDashboardFilters(filters, accessFilter) }
            },
            {
                $addFields: {
                    totalSellingPrice: {
                        $sum: {
                            $cond: [
                                { $eq: ['$quotation.currency', 'USD'] },
                                {
                                    $multiply: [
                                        calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                        qatarUsdRate
                                    ]
                                },
                                calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                            ]
                        }
                    },
                }
            },
            {
                $group: {
                    _id: null,
                    jobAwarded: { $sum: 1 },
                    lastWeekJobAwarded: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', oneWeekAgo] },
                                1,
                                0
                            ]
                        }
                    },
                    revenue: { $sum: '$totalSellingPrice' },
                    lastWeekRevenue: {
                        $sum: {
                            '$cond': [
                                { $gte: ['$createdDate', oneWeekAgo] },
                                '$totalSellingPrice',
                                0
                            ]
                        }
                    },
                }
            },
            {
                $project: {
                    _id: 0,
                    jobAwarded: 1,
                    lastWeekJobAwarded: 1,
                    revenue: 1,
                    lastWeekRevenue: 1
                }
            }
        ]).exec();

        const assignedJobs = assignedJobCount.length ? assignedJobCount[0] : { totalAssignedJobs: 0, lastWeekAssignedJobs: 0 };
        const awardedJobs = assignedJobAwarded.length ? assignedJobAwarded[0] : { jobAwarded: 0, lastWeekJobAwarded: 0, revenue: 0, lastWeekRevenue: 0 };

        return {
            ...assignedJobs,
            ...awardedJobs
        };


    } catch (error) {
        console.error(error);
    }
}


export const getRevenuePerSalesperson = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;

            let accessFilter = {};

            let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
            let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

            switch (privileges.jobSheet.viewReport) {
                case 'none':
                    return res.status(204)
                case 'created':
                    accessFilter = { 'salesPerson._id': new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }


            const qatarUsdRates = await getUSDRated();


            const jobTotal = await jobModel.aggregate([
                {
                    $lookup: { from: 'quotations', localField: 'quoteId', foreignField: '_id', as: 'quotation' }
                },
                {
                    $unwind: '$quotation'
                },
                {
                    $lookup: { from: 'employees', localField: 'quotation.createdBy', foreignField: '_id', as: 'salesPerson' }
                },
                {
                    $lookup: { from: 'departments', localField: 'quotation.department', foreignField: '_id', as: 'department' }
                },
                {
                    $unwind: "$salesPerson"
                },
                {
                    $unwind: "$department"
                },
                {
                    $match: buildDashboardFilters(filters, accessFilter)
                },
                {
                    $group: {
                        _id: '$quotation.createdBy',
                        totalRevenue: {
                            $sum: {
                                $add: [
                                    {
                                        $cond: [
                                            { $eq: ['$quotation.currency', 'USD'] },
                                            {
                                                $round: [
                                                    { $multiply: [calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'), qatarUsdRates] },
                                                    2
                                                ]
                                            },
                                            calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                                        ]
                                    },
                                    {
                                        $reduce: {
                                            input: '$quotation.dealData.additionalCosts',
                                            initialValue: 0,
                                            in: {
                                                $cond: [
                                                    { $eq: ['$$this.type', 'Customer Discount'] },
                                                    { $round: [{ $subtract: ['$$value', '$$this.value'] }, 2] },
                                                    '$$value'
                                                ]
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        firstName: { $first: '$salesPerson.firstName' },
                        lastName: { $first: '$salesPerson.lastName' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        salesPersonId: '$_id',
                        salesPerson: { $concat: ['$firstName', ' ', '$lastName'] },
                        totalRevenue: '$totalRevenue'
                    }
                },
                {
                    $project: {
                        _id: 0,
                        name: '$salesPerson',
                        value: '$totalRevenue'
                    }
                },
            ]).exec();

            return res.status(200).json(jobTotal);
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}


export const getGrossProfitForLastSevenMonths = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;


            let accessFilter = {};

            let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
            let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

            switch (privileges.jobSheet.viewReport) {
                case 'created':
                    accessFilter = { 'salesPerson._id': new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { 'salesPerson._id': { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }

            const dateRange = getDateRange(filters.fromDate, filters.toDate)

            const qatarUsdRate = await getUSDRated();

            let jobGrossProfit = [];
            if (privileges.jobSheet.viewReport && privileges.jobSheet.viewReport !== 'none') {
                jobGrossProfit = await jobModel.aggregate([
                    {
                        $lookup: {
                            from: 'quotations',
                            localField: 'quoteId',
                            foreignField: '_id',
                            as: 'quotation'
                        }
                    },
                    {
                        $unwind: '$quotation'
                    },
                    {
                        $lookup: {
                            from: 'employees',
                            localField: 'quotation.createdBy',
                            foreignField: '_id',
                            as: 'salesPerson'
                        }
                    },
                    {
                        $lookup: {
                            from: 'departments',
                            localField: 'quotation.department',
                            foreignField: '_id',
                            as: 'department'
                        }
                    },
                    {
                        $unwind: "$salesPerson"
                    },
                    {
                        $unwind: "$department"
                    },
                    {
                        $match: {
                            ...accessFilter,
                            ...buildDashboardFilters(filters, accessFilter),
                            createdDate: { $gte: dateRange.gte, $lte: dateRange.lte }
                        }
                    },
                    {
                        $addFields: {
                            totalSellingPrice: {
                                $sum: {
                                    $cond: [
                                        { $eq: ['$quotation.currency', 'USD'] },
                                        {
                                            $multiply: [
                                                calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                                qatarUsdRate
                                            ]
                                        },
                                        calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                                    ]
                                }
                            },
                            totalCostPrice: {
                                $sum: {
                                    $cond: [
                                        { $eq: ['$quotation.currency', 'USD'] },
                                        {
                                            $multiply: [
                                                calculateCostPricePipe('$quotation.dealData.updatedItems'),
                                                qatarUsdRate
                                            ]
                                        },
                                        calculateCostPricePipe('$quotation.dealData.updatedItems')
                                    ]
                                }
                            }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                year: { $year: '$createdDate' },
                                month: { $month: '$createdDate' }
                            },
                            totalSellingPrice: { $sum: '$totalSellingPrice' },
                            totalCost: { $sum: '$totalCostPrice' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            year: '$_id.year',
                            month: { $arrayElemAt: [months, { $subtract: ['$_id.month', 1] }] },
                            grossProfit: { $subtract: ['$totalSellingPrice', '$totalCost'] }
                        }
                    },
                    {
                        $project: {
                            year: 1,
                            month: '$month.name',
                            grossProfit: 1
                        }
                    },
                    {
                        $sort: { year: 1, month: 1 }
                    }
                ]);
            }

            const completeData = lastRangedMonths(dateRange).map(month => {
                const found = jobGrossProfit.find(data =>
                    data.month === month.name && data.year === month.year
                );
                return {
                    month: month.name,
                    grossProfit: found ? found.grossProfit : 0
                };
            });

            const monthArray = completeData.map(data => data.month);
            const profitArray = completeData.map(data => data.grossProfit);

            return res.status(200).json({ months: monthArray, profits: profitArray });
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const getEnquirySalesConversion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;


            let accessFilter = {};

            let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
            let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

            switch (privileges.enquiry.viewReport) {
                case 'created':
                    accessFilter = { salesPerson: new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }

            const directTotal = await quotationModel.aggregate([
                {
                    $match: {
                        isDeleted: false
                    }
                },
                {
                    $lookup: {
                        from: "enquiries", // The name of your Enquiry collection
                        localField: "enqId",
                        foreignField: "_id",
                        as: "enquiry"
                    }
                },
                {
                    $unwind: {
                        path: "$enquiry",
                        preserveNullAndEmptyArrays: false // This will remove documents where enqId doesn't exist
                    }
                },
                {
                    $match: {
                        "enquiry.preSale.presalePerson": { $exists: false }
                    }
                },
                {
                    $addFields: {
                        createdDate: "$date"
                    }
                },
                {
                    $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'salesPerson' }
                },
                {
                    $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
                },
                {
                    $unwind: "$salesPerson"
                },
                {
                    $unwind: "$department"
                },
                {
                    $match: buildDashboardFilters(filters, accessFilter)
                },
                {
                    $lookup: {
                        from: "jobs",
                        localField: "_id",
                        foreignField: "quoteId",
                        as: "job"
                    }
                },

                // Stage 6: Add a field to check if job exists
                {
                    $addFields: {
                        hasJob: { $gt: [{ $size: "$job" }, 0] }
                    }
                },

                // Stage 7: Group and count
                {
                    $group: {
                        _id: null,
                        directQuotes: { $sum: 1 },
                        jobbedQuotes: {
                            $sum: { $cond: [{ $eq: ["$hasJob", true] }, 1, 0] }
                        }
                    }
                },

                // Stage 8: Project to reshape the output
                {
                    $project: {
                        _id: 0,
                        directQuotes: 1,
                        jobbedQuotes: 1
                    }
                }
            ]).exec();

            const totalQuotes = directTotal.length > 0 ? directTotal[0].directQuotes : 0;
            const convertedQuotes = directTotal.length > 0 ? directTotal[0].jobbedQuotes : 0;

            return res.status(200).json({ total: totalQuotes, converted: convertedQuotes });
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const getPresaleJobSalesConversion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;


            let accessFilter = {};

            let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
            let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

            switch (privileges.enquiry.viewReport) {
                case 'created':
                    accessFilter = { salesPerson: new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }

            const directTotal = await quotationModel.aggregate([
                {
                    $match: {
                        isDeleted: false
                    }
                },
                {
                    $lookup: {
                        from: "enquiries", // The name of your Enquiry collection
                        localField: "enqId",
                        foreignField: "_id",
                        as: "enquiry"
                    }
                },
                {
                    $unwind: {
                        path: "$enquiry",
                        preserveNullAndEmptyArrays: false // This will remove documents where enqId doesn't exist
                    }
                },
                {
                    $match: {
                        "enquiry.preSale.presalePerson": { $exists: true, $ne: null },
                    }
                },
                {
                    $addFields: {
                        createdDate: "$date"
                    }
                },
                {
                    $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'salesPerson' }
                },
                {
                    $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
                },
                {
                    $unwind: "$salesPerson"
                },
                {
                    $unwind: "$department"
                },
                {
                    $match: buildDashboardFilters(filters, accessFilter)
                },
                {
                    $lookup: {
                        from: "jobs",
                        localField: "_id",
                        foreignField: "quoteId",
                        as: "job"
                    }
                },

                // Stage 6: Add a field to check if job exists
                {
                    $addFields: {
                        hasJob: { $gt: [{ $size: "$job" }, 0] }
                    }
                },

                // Stage 7: Group and count
                {
                    $group: {
                        _id: null,
                        directQuotes: { $sum: 1 },
                        jobbedQuotes: {
                            $sum: { $cond: [{ $eq: ["$hasJob", true] }, 1, 0] }
                        }
                    }
                },

                // Stage 8: Project to reshape the output
                {
                    $project: {
                        _id: 0,
                        directQuotes: 1,
                        jobbedQuotes: 1
                    }
                }
            ]).exec();


            const totalQuotes = directTotal.length > 0 ? directTotal[0].directQuotes : 0;
            const convertedQuotes = directTotal.length > 0 ? directTotal[0].jobbedQuotes : 0;

            return res.status(200).json({ total: totalQuotes, converted: convertedQuotes });
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const getReAssignedPresaleJobSalesConversion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, filters } = req.body;
        console.log(filters)
        if (userId) {
            const userCategory = (await employeeModel.findById(userId)).category;
            const privileges: Privileges = (await categoryModel.findById(userCategory)).privileges;


            let accessFilter = {};

            let employeesReportingToUser = await employeeModel.find({ reportingTo: userId }, '_id');
            let reportedToUserIds = employeesReportingToUser.map(employee => employee._id);

            switch (privileges.enquiry.viewReport) {
                case 'created':
                    accessFilter = { salesPerson: new ObjectId(userId) };
                    break;
                case 'reported':
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;
                case 'createdAndReported':
                    reportedToUserIds.push(new ObjectId(userId));
                    accessFilter = { salesPerson: { $in: reportedToUserIds } };
                    break;

                default:
                    break;
            }

            const directTotal = await quotationModel.aggregate([
                {
                    $match: {
                        isDeleted: false
                    }
                },
                {
                    $lookup: {
                        from: "enquiries", // The name of your Enquiry collection
                        localField: "enqId",
                        foreignField: "_id",
                        as: "enquiry"
                    }
                },
                {
                    $unwind: {
                        path: "$enquiry",
                        preserveNullAndEmptyArrays: false // This will remove documents where enqId doesn't exist
                    }
                },
                {
                    $match: {
                        "enquiry.preSale.presalePerson": { $exists: true, $ne: null },
                        "enquiry.reAssigned": { $exists: true, $ne: null },
                    }
                },
                {
                    $addFields: {
                        createdDate: "$date"
                    }
                },
                {
                    $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'salesPerson' }
                },
                {
                    $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
                },
                {
                    $unwind: "$salesPerson"
                },
                {
                    $unwind: "$department"
                },
                {
                    $match: buildDashboardFilters(filters, accessFilter)
                },
                {
                    $lookup: {
                        from: "jobs",
                        localField: "_id",
                        foreignField: "quoteId",
                        as: "job"
                    }
                },

                // Stage 6: Add a field to check if job exists
                {
                    $addFields: {
                        hasJob: { $gt: [{ $size: "$job" }, 0] }
                    }
                },

                // Stage 7: Group and count
                {
                    $group: {
                        _id: null,
                        directQuotes: { $sum: 1 },
                        jobbedQuotes: {
                            $sum: { $cond: [{ $eq: ["$hasJob", true] }, 1, 0] }
                        }
                    }
                },

                // Stage 8: Project to reshape the output
                {
                    $project: {
                        _id: 0,
                        directQuotes: 1,
                        jobbedQuotes: 1
                    }
                }
            ]).exec();


            const totalQuotes = directTotal.length > 0 ? directTotal[0].directQuotes : 0;
            const convertedQuotes = directTotal.length > 0 ? directTotal[0].jobbedQuotes : 0;

            return res.status(200).json({ total: totalQuotes, converted: convertedQuotes });
        }

    } catch (error) {
        console.log(error)
        next(error);
    }
}
