import mongoose from "mongoose";
import Customer from "../models/customer.model";

const BLOCKED_CUSTOMER_STATUSES = ["On Hold", "Blacklisted", "Inactive"];
const BLOCKED_CREDIT_STATUSES = ["Hold", "Exceeded"];
const CREDIT_WARNING_STATUSES = ["Watch"];

export const selectedDealLines = (items: any[]): any[] => (Array.isArray(items) ? items : [])
    .flatMap((item: any) => Array.isArray(item?.itemDetails) ? item.itemDetails : [])
    .filter((detail: any) => !!detail?.dealSelected);

export const sumDealSelling = (lines: any[]): number =>
    lines.reduce((sum: number, line: any) => sum + (Number(line?.unitSellingPrice) || 0) * (Number(line?.quantity) || 0), 0);

export const dealCustomerDiscount = (dealData: any): number => {
    const lineDiscount = Number(dealData?.totalDiscount) || 0;
    const costDiscount = (Array.isArray(dealData?.additionalCosts) ? dealData.additionalCosts : [])
        .filter((cost: any) => cost?.type === "Customer Discount")
        .reduce((sum: number, cost: any) => sum + (Number(cost?.value) || 0), 0);
    return lineDiscount + costDiscount;
};

export const estimateQuoteValue = (quote: any): number => {
    const dealLines = selectedDealLines(quote?.dealData?.updatedItems);
    if (dealLines.length) {
        return Math.max(sumDealSelling(dealLines) - dealCustomerDiscount(quote?.dealData), 0);
    }

    const quoteLines = Array.isArray(quote?.optionalItems?.items) ? quote.optionalItems.items : [];
    const quoteGross = quoteLines
        .flatMap((item: any) => Array.isArray(item?.itemDetails) ? item.itemDetails : [])
        .reduce((sum: number, line: any) => {
            const unitSelling = Number(line?.unitSellingPrice ?? line?.sellingPrice ?? line?.price) || 0;
            return sum + unitSelling * (Number(line?.quantity) || 0);
        }, 0);
    return Math.max(quoteGross - (Number(quote?.optionalItems?.totalDiscount) || 0), 0);
};

export const normalizeTaxForCustomer = (payload: any, customer: any): any => {
    if (!customer?.taxExempt || !payload || typeof payload !== "object") return payload;

    const normalized = { ...payload };
    ["taxAmount", "vatAmount", "tax", "vat"].forEach((field) => {
        if (field in normalized) normalized[field] = 0;
    });
    ["taxRate", "vatRate"].forEach((field) => {
        if (field in normalized) normalized[field] = 0;
    });
    if (Number.isFinite(Number(normalized.subTotal)) && ("totalAmount" in normalized || "grandTotal" in normalized || "amount" in normalized)) {
        if ("totalAmount" in normalized) normalized.totalAmount = Number(normalized.subTotal);
        if ("grandTotal" in normalized) normalized.grandTotal = Number(normalized.subTotal);
        if ("amount" in normalized) normalized.amount = Number(normalized.subTotal);
    }
    if (Array.isArray(normalized.items)) {
        normalized.items = normalized.items.map((item: any) => normalizeTaxForCustomer(item, customer));
    }
    return normalized;
};

export const getCustomerCommercialGuard = async (customerId: any, amount = 0) => {
    if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId))) {
        return {
            customer: null,
            blocked: true,
            warnings: [],
            message: "Valid customer is required"
        };
    }

    const customer = await Customer.findById(customerId, "companyName status creditLimit creditStatus taxExempt").lean();
    if (!customer) {
        return {
            customer: null,
            blocked: true,
            warnings: [],
            message: "Customer not found"
        };
    }

    const warnings: string[] = [];
    const status = String(customer.status || "");
    const creditStatus = String(customer.creditStatus || "");
    const creditLimit = Number(customer.creditLimit);
    const value = Number(amount) || 0;

    if (BLOCKED_CUSTOMER_STATUSES.includes(status)) {
        return {
            customer,
            blocked: true,
            warnings,
            message: `Customer ${customer.companyName} is ${status}. New transactions are blocked.`
        };
    }

    if (BLOCKED_CREDIT_STATUSES.includes(creditStatus)) {
        return {
            customer,
            blocked: true,
            warnings,
            message: `Customer ${customer.companyName} credit status is ${creditStatus}. New transactions are blocked.`
        };
    }

    if (status === "Prospect") {
        warnings.push(`Customer ${customer.companyName} is still marked as Prospect.`);
    }
    if (CREDIT_WARNING_STATUSES.includes(creditStatus)) {
        warnings.push(`Customer ${customer.companyName} credit status is ${creditStatus}.`);
    }
    if (value > 0 && Number.isFinite(creditLimit) && creditLimit >= 0 && value > creditLimit) {
        warnings.push(`Transaction value ${value.toFixed(2)} exceeds customer credit limit ${creditLimit.toFixed(2)}.`);
    }

    return {
        customer,
        blocked: false,
        warnings,
        message: warnings[0] || ""
    };
};
